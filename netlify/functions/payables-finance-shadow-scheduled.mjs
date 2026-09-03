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
  if (!url || !key) return false;
  try {
    const response = await fetch(`${url}/rest/v1/hms_audit_log`, {
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
        entity_type: 'payables_shadow_sync',
        metadata,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export default async () => {
  await audit('payables_shadow_started');
  try {
    const store = getStore(STORE_NAME, { consistency: 'strong' });
    const state = await store.get(STATE_KEY, { type: 'json' });
    if (!state || !Array.isArray(state.items)) {
      await audit('payables_shadow_failed', { stage: 'blob_read', reason: 'state_not_found' });
      console.error('Payables finance shadow: source state not found');
      return;
    }
    await audit('payables_shadow_source_read', {
      items: state.items.length,
      runs: state.runs && typeof state.runs === 'object' ? Object.keys(state.runs).length : 0,
    });
    const stats = await syncPayablesToFinance(state);
    await audit('payables_shadow_succeeded', { parity: stats?.parity || null });
    console.log('Payables finance shadow sync complete', JSON.stringify(stats));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await audit('payables_shadow_failed', { stage: 'sync', error: message.slice(0, 500) });
    console.error('Payables finance shadow scheduled sync failed', message);
  }
};

export const config = {
  schedule: '* * * * *',
};
