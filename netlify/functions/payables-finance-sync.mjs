import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { syncPayablesToFinance } from './lib/payables-finance-shadow.mjs';

const STORE_NAME = 'hms-payables';
const STATE_KEY = 'state-v1';
const REQUEST_TIMEOUT_MS = 10000;
const SYNC_TIMEOUT_MS = 25000;
const PROTECTED_STATUSES = new Set(['payment_pending', 'paid', 'reconciled', 'posted', 'cancelled']);

function env(name) {
  try { return Netlify.env.get(name) || ''; } catch { return process.env[name] || ''; }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'unknown_error');
}

async function withTimeout(promise, label, timeoutMs = REQUEST_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function supabaseConfig() {
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  return url && key ? { url, key } : null;
}

async function rest(config, path, { method = 'GET', body, prefer = '' } = {}) {
  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${config.url}/rest/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('supabase_request_timeout');
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase request failed ${response.status}: ${detail.slice(0, 300)}`);
  }
  if (response.status === 204) return [];
  return response.json().catch(() => []);
}

async function audit(config, action, metadata = {}) {
  if (!config) return;
  try {
    await rest(config, 'hms_audit_log', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        capability_id: 'finance.payables',
        action,
        entity_type: 'payables_setup',
        metadata,
      },
    });
  } catch (error) {
    console.error('Payables setup audit failed', errorMessage(error));
  }
}

async function adminDeviceAuthorized(req) {
  const token = String(req.headers.get('x-hms-device-token') || '').trim();
  if (!token) return false;

  const config = supabaseConfig();
  if (!config) throw new Error('supabase_not_configured');

  const hash = createHash('sha256').update(token).digest('hex');
  const sessionQuery = new URLSearchParams({
    select: 'id,device_id,expires_at,revoked_at',
    token_hash: `eq.${hash}`,
    limit: '1',
  });
  const sessions = await rest(config, `hms_device_sessions?${sessionQuery}`);
  const session = sessions?.[0];
  if (!session || session.revoked_at) return false;
  if (session.expires_at && session.expires_at <= new Date().toISOString()) return false;

  const deviceQuery = new URLSearchParams({
    select: 'id,allowed,is_admin',
    id: `eq.${session.device_id}`,
    limit: '1',
  });
  const devices = await rest(config, `hms_devices?${deviceQuery}`);
  const device = devices?.[0];
  return Boolean(device?.allowed && device?.is_admin);
}

function prepareSource(state, selectedMonth = monthKey()) {
  if (!state || !Array.isArray(state.items)) {
    return {
      state: null,
      summary: {
        readable: false,
        selectedMonth,
        recurringItems: 0,
        oneTimeItems: 0,
        selectedItems: 0,
        storedMonths: 0,
        totalItemsToCompare: 0,
        ready: false,
        updatedAt: null,
        error: 'legacy_payables_state_missing',
      },
    };
  }

  const activeItems = state.items.filter((item) => item?.active !== false);
  const originalRuns = state.runs && typeof state.runs === 'object' ? state.runs : {};
  const selectedRun = originalRuns[selectedMonth] || {
    month: selectedMonth,
    approvals: {},
    oneTimeItems: [],
    virtualForSetup: true,
  };

  // The setup copy is created in memory. It does not modify the live Blob merely to
  // manufacture a month record. Existing stored months remain part of the comparison.
  const migrationState = {
    ...state,
    runs: {
      ...originalRuns,
      [selectedMonth]: selectedRun,
    },
  };

  const monthRows = Object.entries(migrationState.runs).map(([month, run]) => {
    const oneTimeItems = Array.isArray(run?.oneTimeItems) ? run.oneTimeItems.length : 0;
    return {
      month,
      recurringItems: activeItems.length,
      oneTimeItems,
      approvals: run?.approvals && typeof run.approvals === 'object'
        ? Object.keys(run.approvals).length
        : 0,
      instances: activeItems.length + oneTimeItems,
    };
  });
  const selected = monthRows.find((row) => row.month === selectedMonth) || {
    recurringItems: activeItems.length,
    oneTimeItems: 0,
    instances: activeItems.length,
  };

  return {
    state: migrationState,
    summary: {
      readable: true,
      selectedMonth,
      recurringItems: selected.recurringItems,
      oneTimeItems: selected.oneTimeItems,
      selectedItems: selected.instances,
      storedMonths: Object.keys(originalRuns).length,
      totalItemsToCompare: monthRows.reduce((sum, row) => sum + row.instances, 0),
      ready: selected.instances > 0,
      updatedAt: state.updatedAt || null,
      error: null,
    },
  };
}

async function sourceSnapshot(selectedMonth = monthKey()) {
  const store = getStore(STORE_NAME);
  const state = await withTimeout(
    store.get(STATE_KEY, { type: 'json' }),
    'legacy_blob_read',
  );
  const prepared = prepareSource(state, selectedMonth);
  return { store, ...prepared };
}

async function databaseStatus() {
  const config = supabaseConfig();
  if (!config) throw new Error('supabase_not_configured');

  const syncQuery = new URLSearchParams({
    select: 'connector,source_account,last_attempt_at,last_success_at,status,error_text,stats',
    connector: 'eq.payables_blob',
    source_account: 'eq.hms-payables/state-v1',
    limit: '1',
  });

  const [syncRows, allVendors, allRules, allPayables, allAuthorizations] = await Promise.all([
    rest(config, `hms_sync_state?${syncQuery}`),
    rest(config, 'hms_finance_vendors?select=id,vendor_key'),
    rest(config, 'hms_finance_recurring_rules?select=id,external_key'),
    rest(config, 'hms_finance_payables?select=id,status,source_type'),
    rest(config, 'hms_finance_authorizations?select=id,status,metadata'),
  ]);

  const vendors = allVendors.filter((row) => String(row.vendor_key || '').startsWith('legacy-payables:'));
  const rules = allRules.filter((row) => String(row.external_key || '').startsWith('legacy-payables-rule:'));
  const payables = allPayables.filter((row) => row.source_type === 'legacy_payables_blob');
  const authorizations = allAuthorizations.filter((row) => row.status === 'authorized' && row?.metadata?.shadow_sync === true);
  const sync = syncRows?.[0] || null;
  const parity = sync?.stats?.parity || null;
  const operationalLegacyCount = payables.filter((row) => PROTECTED_STATUSES.has(row.status)).length;
  const hasComparedItems = Number(parity?.expected || 0) > 0;

  return {
    configured: true,
    vendors: vendors.length,
    recurringRules: rules.length,
    payables: payables.length,
    activeAuthorizations: authorizations.length,
    operationalLegacyCount,
    syncLocked: operationalLegacyCount > 0,
    sync,
    parity,
    passed: Boolean(sync?.status === 'success' && parity?.matched === true && hasComparedItems),
  };
}

async function setupStatus(selectedMonth = monthKey()) {
  const startedAt = Date.now();
  const [sourceResult, databaseResult] = await Promise.allSettled([
    sourceSnapshot(selectedMonth),
    databaseStatus(),
  ]);

  const source = sourceResult.status === 'fulfilled'
    ? sourceResult.value.summary
    : {
        readable: false,
        selectedMonth,
        recurringItems: 0,
        oneTimeItems: 0,
        selectedItems: 0,
        storedMonths: 0,
        totalItemsToCompare: 0,
        ready: false,
        updatedAt: null,
        error: errorMessage(sourceResult.reason),
      };

  const database = databaseResult.status === 'fulfilled'
    ? databaseResult.value
    : {
        configured: false,
        vendors: 0,
        recurringRules: 0,
        payables: 0,
        activeAuthorizations: 0,
        operationalLegacyCount: 0,
        syncLocked: false,
        sync: null,
        parity: null,
        passed: false,
        error: errorMessage(databaseResult.reason),
      };

  return {
    ok: sourceResult.status === 'fulfilled' && databaseResult.status === 'fulfilled',
    authority: database.passed ? 'copy_verified_not_cut_over' : 'legacy_payables',
    source,
    database,
    diagnostics: {
      durationMs: Date.now() - startedAt,
      sourceStatus: sourceResult.status,
      databaseStatus: databaseResult.status,
    },
  };
}

export default async (req) => {
  if (!['GET', 'POST'].includes(req.method)) return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const authorized = await adminDeviceAuthorized(req);
    if (!authorized) return json({ ok: false, error: 'Admin device required' }, 403);
  } catch (error) {
    console.error('Payables setup authorization failed', errorMessage(error));
    return json({
      ok: false,
      error: 'Payables setup authorization failed',
      detail: errorMessage(error),
    }, 503);
  }

  const selectedMonth = monthKey();
  const config = supabaseConfig();

  try {
    if (req.method === 'GET') {
      // Status is informational. Return component-level errors in the body so the UI
      // remains understandable instead of collapsing to a generic loading failure.
      return json(await setupStatus(selectedMonth));
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'copy-and-compare').trim();
    if (action !== 'copy-and-compare') return json({ ok: false, error: 'Unknown action' }, 400);

    const before = await databaseStatus();
    if (before.syncLocked) {
      return json({
        ok: false,
        error: 'setup_locked_after_finance_activity',
        detail: 'The copied records have already entered payment or accounting workflow, so the setup copy is locked against regression.',
        database: before,
      }, 409);
    }

    const snapshot = await sourceSnapshot(selectedMonth);
    if (!snapshot.summary.readable) {
      return json({ ok: false, error: 'Existing Payables data could not be read' }, 503);
    }
    if (!snapshot.summary.ready || !snapshot.state) {
      return json({ ok: false, error: 'No Payables items found to copy' }, 409);
    }

    await audit(config, 'payables_setup_copy_started', {
      month: selectedMonth,
      currentMonthItems: snapshot.summary.selectedItems,
      totalItemsToCompare: snapshot.summary.totalItemsToCompare,
    });

    const stats = await withTimeout(
      syncPayablesToFinance(snapshot.state),
      'payables_copy_and_compare',
      SYNC_TIMEOUT_MS,
    );
    const database = await databaseStatus();

    await audit(config, database.passed ? 'payables_setup_copy_verified' : 'payables_setup_copy_mismatch', {
      month: selectedMonth,
      parity: database.parity,
    });

    return json({
      ok: true,
      authority: database.passed ? 'copy_verified_not_cut_over' : 'legacy_payables',
      source: snapshot.summary,
      database,
      stats,
    });
  } catch (error) {
    const message = errorMessage(error);
    await audit(config, 'payables_setup_failed', { message: message.slice(0, 500) });
    console.error('Payables setup failed', message);
    return json({
      ok: false,
      error: 'Payables setup failed',
      detail: message,
    }, 500);
  }
};
