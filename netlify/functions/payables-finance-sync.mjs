import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { syncPayablesToFinance } from './lib/payables-finance-shadow.mjs';

const STORE_NAME = 'hms-payables';
const STATE_KEY = 'state-v1';

function env(name) {
  try { return Netlify.env.get(name) || ''; } catch { return process.env[name] || ''; }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function supabaseConfig() {
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return { url, key };
}

async function rest(config, path) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Supabase status query failed ${response.status}`);
  return response.json().catch(() => []);
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

async function sourceStatus() {
  const store = getStore(STORE_NAME, { consistency: 'strong' });
  const state = await store.get(STATE_KEY, { type: 'json' });
  if (!state || !Array.isArray(state.items)) return { readable: false, items: 0, runs: 0, instances: 0, updatedAt: null };
  let instances = 0;
  for (const run of Object.values(state.runs || {})) {
    const recurring = (state.items || []).filter((item) => item.active !== false);
    instances += recurring.length + (run?.oneTimeItems || []).length;
  }
  return {
    readable: true,
    items: state.items.length,
    runs: Object.keys(state.runs || {}).length,
    instances,
    updatedAt: state.updatedAt || null,
  };
}

async function databaseStatus() {
  const config = supabaseConfig();
  if (!config) return { configured: false };
  const [syncRows, vendors, rules, payables, authorizations] = await Promise.all([
    rest(config, 'hms_sync_state?select=connector,source_account,last_source_timestamp,last_attempt_at,last_success_at,status,error_text,stats&connector=eq.payables_blob&source_account=eq.hms-payables%2Fstate-v1&limit=1'),
    rest(config, 'hms_finance_vendors?select=id&vendor_key=like.legacy-payables%3A*'),
    rest(config, 'hms_finance_recurring_rules?select=id&external_key=like.legacy-payables-rule%3A*'),
    rest(config, 'hms_finance_payables?select=id&source_type=eq.legacy_payables_blob'),
    rest(config, 'hms_finance_authorizations?select=id,metadata&status=eq.authorized'),
  ]);
  const sync = syncRows?.[0] || null;
  const parity = sync?.stats?.parity || null;
  return {
    configured: true,
    vendors: vendors.length,
    recurringRules: rules.length,
    payables: payables.length,
    activeAuthorizations: authorizations.filter((row) => row?.metadata?.shadow_sync === true).length,
    sync,
    parity,
    passed: Boolean(sync?.status === 'success' && parity?.matched === true),
  };
}

export default async (req) => {
  if (!['GET', 'POST'].includes(req.method)) return json({ ok: false, error: 'Method not allowed' }, 405);

  let authorized = false;
  try { authorized = await adminDeviceAuthorized(req); } catch { authorized = false; }
  if (!authorized) return json({ ok: false, error: 'Admin device required' }, 403);

  try {
    if (req.method === 'GET') {
      const [source, database] = await Promise.all([sourceStatus(), databaseStatus()]);
      return json({ ok: true, authority: database.passed ? 'parity_passed_not_cut_over' : 'legacy_blob', source, database });
    }

    const store = getStore(STORE_NAME, { consistency: 'strong' });
    const state = await store.get(STATE_KEY, { type: 'json' });
    if (!state || !Array.isArray(state.items)) return json({ ok: false, error: 'Payables state not found' }, 404);
    const stats = await syncPayablesToFinance(state);
    const database = await databaseStatus();
    return json({ ok: true, stats, database, authority: database.passed ? 'parity_passed_not_cut_over' : 'legacy_blob' });
  } catch (error) {
    console.error('Payables finance sync failed', error instanceof Error ? error.message : error);
    return json({ ok: false, error: req.method === 'GET' ? 'Payables migration status failed' : 'Payables finance sync failed' }, 500);
  }
};
