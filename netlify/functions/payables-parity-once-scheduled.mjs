import { getStore } from '@netlify/blobs';
import { syncPayablesToFinance } from './lib/payables-finance-shadow.mjs';

const STORE_NAME = 'hms-payables';
const STATE_KEY = 'state-v1';

function env(name) {
  try { return Netlify.env.get(name) || ''; } catch { return process.env[name] || ''; }
}

async function audit(action, metadata = {}) {
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return;
  await fetch(`${url}/rest/v1/hms_audit_log`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      capability_id: 'finance.payables',
      action,
      entity_type: 'legacy_payables_parity',
      metadata,
    }),
  }).catch(() => {});
}

async function alreadyPassed() {
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return false;
  const params = new URLSearchParams({
    select: 'status,stats',
    connector: 'eq.payables_blob',
    source_account: 'eq.hms-payables/state-v1',
    limit: '1',
  });
  const response = await fetch(`${url}/rest/v1/hms_sync_state?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!response.ok) return false;
  const rows = await response.json().catch(() => []);
  return Boolean(rows?.[0]?.status === 'success' && rows?.[0]?.stats?.parity?.matched === true);
}

export default async () => {
  if (await alreadyPassed()) return;
  try {
    const store = getStore(STORE_NAME, { consistency: 'strong' });
    const state = await store.get(STATE_KEY, { type: 'json' });
    if (!state || !Array.isArray(state.items)) {
      await audit('legacy_payables_parity_failed', { stage: 'source', reason: 'state_not_found' });
      return;
    }
    const stats = await syncPayablesToFinance(state);
    await audit(stats?.parity?.matched ? 'legacy_payables_parity_passed' : 'legacy_payables_parity_partial', {
      sourceItems: state.items.length,
      sourceRuns: Object.keys(state.runs || {}).length,
      parity: stats?.parity || null,
    });
  } catch (error) {
    await audit('legacy_payables_parity_failed', {
      stage: 'sync',
      error: String(error instanceof Error ? error.message : error).slice(0, 800),
    });
  }
};

export const config = { schedule: '* * * * *' };
