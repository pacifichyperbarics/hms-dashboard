import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { syncPayablesToFinance } from './lib/payables-finance-shadow.mjs';

const STORE_NAME = 'hms-payables';
const STATE_KEY = 'state-v1';
const PROTECTED_STATUSES = new Set(['payment_pending','paid','reconciled','posted','cancelled']);

function env(name) {
  try { return Netlify.env.get(name) || ''; } catch { return process.env[name] || ''; }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function validMonth(value) {
  const text = String(value || '').trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text) ? text : null;
}

function supabaseConfig() {
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return { url, key };
}

async function rest(config, path, { method = 'GET', body, prefer = '' } = {}) {
  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase request failed ${response.status}: ${detail.slice(0, 300)}`);
  }
  if (response.status === 204) return [];
  return response.json().catch(() => []);
}

async function audit(config, action, metadata = {}) {
  try {
    await rest(config, 'hms_audit_log', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        capability_id: 'finance.payables',
        action,
        entity_type: 'payables_migration',
        metadata,
      },
    });
  } catch (error) {
    console.error('Payables migration audit failed', error instanceof Error ? error.message : error);
  }
}

async function adminDeviceAuthorized(req) {
  const token = String(req.headers.get('x-hms-device-token') || '').trim();
  if (!token) return false;
  const config = supabaseConfig();
  if (!config) return false;
  const hash = createHash('sha256').update(token).digest('hex');
  const query = new URLSearchParams({
    select: 'id,device_id,expires_at,revoked_at,hms_devices!inner(id,allowed,is_admin)',
    token_hash: `eq.${hash}`,
    limit: '1',
  });
  const rows = await rest(config, `hms_device_sessions?${query}`);
  const session = rows?.[0];
  if (!session || session.revoked_at) return false;
  if (session.expires_at && session.expires_at <= new Date().toISOString()) return false;
  const device = Array.isArray(session.hms_devices) ? session.hms_devices[0] : session.hms_devices;
  return Boolean(device?.allowed && device?.is_admin);
}

function summarizeSource(state) {
  if (!state || !Array.isArray(state.items)) {
    return {
      readable: false,
      items: 0,
      activeItems: 0,
      runs: 0,
      instances: 0,
      months: [],
      readyForParity: false,
      readinessReason: 'source_state_missing',
      updatedAt: null,
    };
  }

  const activeItems = state.items.filter((item) => item?.active !== false).length;
  const months = Object.entries(state.runs || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, run]) => {
      const oneTimeItems = Array.isArray(run?.oneTimeItems) ? run.oneTimeItems.length : 0;
      const approvals = run?.approvals && typeof run.approvals === 'object'
        ? Object.keys(run.approvals).length
        : 0;
      return {
        month,
        recurringItems: activeItems,
        oneTimeItems,
        approvals,
        instances: activeItems + oneTimeItems,
      };
    });
  const instances = months.reduce((sum, row) => sum + row.instances, 0);
  const readyForParity = activeItems === 0 || instances > 0;

  return {
    readable: true,
    items: state.items.length,
    activeItems,
    runs: months.length,
    instances,
    months,
    readyForParity,
    readinessReason: readyForParity ? null : 'legacy_payables_no_persisted_month_runs',
    updatedAt: state.updatedAt || null,
  };
}

async function sourceSnapshot() {
  const store = getStore(STORE_NAME, { consistency: 'strong' });
  const state = await store.get(STATE_KEY, { type: 'json' });
  return { store, state, source: summarizeSource(state) };
}

async function initializeSourceMonth(month) {
  const snapshot = await sourceSnapshot();
  if (!snapshot.source.readable) return { ok: false, error: 'Payables state not found' };
  const state = snapshot.state;
  state.runs = state.runs && typeof state.runs === 'object' ? state.runs : {};
  const existed = Boolean(state.runs[month]);
  if (!existed) {
    const now = new Date().toISOString();
    state.runs[month] = { month, approvals: {}, createdAt: now, updatedAt: now };
    state.updatedAt = now;
    await snapshot.store.setJSON(STATE_KEY, state);
  }
  return { ok: true, initialized: !existed, month, source: summarizeSource(state) };
}

async function databaseStatus() {
  const config = supabaseConfig();
  if (!config) return { configured: false };
  const [syncRows, vendors, rules, payables, authorizations] = await Promise.all([
    rest(config, 'hms_sync_state?select=connector,source_account,last_source_timestamp,last_attempt_at,last_success_at,status,error_text,stats&connector=eq.payables_blob&source_account=eq.hms-payables%2Fstate-v1&limit=1'),
    rest(config, 'hms_finance_vendors?select=id&vendor_key=like.legacy-payables%3A*'),
    rest(config, 'hms_finance_recurring_rules?select=id&external_key=like.legacy-payables-rule%3A*'),
    rest(config, 'hms_finance_payables?select=id,status&source_type=eq.legacy_payables_blob'),
    rest(config, 'hms_finance_authorizations?select=id,metadata&status=eq.authorized'),
  ]);
  const sync = syncRows?.[0] || null;
  const parity = sync?.stats?.parity || null;
  const operationalLegacyCount = payables.filter((row) => PROTECTED_STATUSES.has(row.status)).length;
  const parityHasInstances = Number(parity?.expected || 0) > 0;
  return {
    configured: true,
    vendors: vendors.length,
    recurringRules: rules.length,
    payables: payables.length,
    activeAuthorizations: authorizations.filter((row) => row?.metadata?.shadow_sync === true).length,
    operationalLegacyCount,
    syncLocked: operationalLegacyCount > 0,
    sync,
    parity,
    parityHasInstances,
    passed: Boolean(sync?.status === 'success' && parity?.matched === true && parityHasInstances),
  };
}

export default async (req) => {
  if (!['GET', 'POST'].includes(req.method)) return json({ ok: false, error: 'Method not allowed' }, 405);

  let authorized = false;
  try { authorized = await adminDeviceAuthorized(req); } catch { authorized = false; }
  if (!authorized) return json({ ok: false, error: 'Admin device required' }, 403);

  const config = supabaseConfig();
  try {
    if (req.method === 'GET') {
      const [snapshot, database] = await Promise.all([sourceSnapshot(), databaseStatus()]);
      return json({
        ok: true,
        authority: database.passed ? 'parity_passed_not_cut_over' : 'legacy_blob',
        source: snapshot.source,
        database,
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'sync').trim();
    const before = await databaseStatus();
    if (before.syncLocked) {
      return json({
        ok: false,
        error: 'migration_locked_after_finance_activity',
        detail: `${before.operationalLegacyCount} migrated legacy payable(s) have entered payment/reconciliation/posting state. Parity sync is locked to prevent status regression.`,
        database: before,
      }, 409);
    }

    if (action === 'initialize-month') {
      const month = validMonth(body.month) || monthKey();
      const initialized = await initializeSourceMonth(month);
      if (!initialized.ok) return json({ ok: false, error: initialized.error }, 404);
      if (config) await audit(config, initialized.initialized ? 'legacy_payables_month_initialized' : 'legacy_payables_month_already_initialized', { month });
      return json({ ok: true, authority: 'legacy_blob', ...initialized, database: before });
    }

    if (action !== 'sync') return json({ ok: false, error: 'Unknown action' }, 400);

    const snapshot = await sourceSnapshot();
    if (!snapshot.source.readable) return json({ ok: false, error: 'Payables state not found' }, 404);
    if (!snapshot.source.readyForParity) {
      return json({
        ok: false,
        error: 'legacy_payables_no_persisted_month_runs',
        detail: 'Legacy Payables contains recurring definitions but no persisted monthly run. Initialize the intended month before running parity.',
        source: snapshot.source,
        database: before,
      }, 409);
    }

    if (config) await audit(config, 'payables_parity_started', {
      sourceItems: snapshot.source.items,
      sourceRuns: snapshot.source.runs,
      sourceInstances: snapshot.source.instances,
    });

    const stats = await syncPayablesToFinance(snapshot.state);
    const database = await databaseStatus();
    if (config) await audit(config, database.passed ? 'payables_parity_passed' : 'payables_parity_mismatch', {
      parity: database.parity,
      sourceRuns: snapshot.source.runs,
    });
    return json({
      ok: true,
      stats,
      source: snapshot.source,
      database,
      authority: database.passed ? 'parity_passed_not_cut_over' : 'legacy_blob',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (config) await audit(config, 'payables_parity_failed', { message: message.slice(0, 500) });
    console.error('Payables finance sync failed', message);
    return json({ ok: false, error: req.method === 'GET' ? 'Payables migration status failed' : 'Payables finance sync failed' }, 500);
  }
};
