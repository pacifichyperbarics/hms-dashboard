import { getStore } from '@netlify/blobs';
import { syncPayablesToFinance } from './lib/payables-finance-shadow.mjs';

function env(name) {
  try { return Netlify.env.get(name) || ''; } catch { return process.env[name] || ''; }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function authorized(req) {
  const expected = env('HMS_PAYABLES_SHADOW_TOKEN');
  if (!expected) return false;
  const auth = req.headers.get('authorization') || '';
  const header = req.headers.get('x-hms-shadow-token') || '';
  return auth === `Bearer ${expected}` || header === expected;
}

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (!authorized(req)) return json({ ok: false, error: 'Unauthorized' }, 401);

  try {
    const store = getStore(STORE_NAME, { consistency: 'strong' });
    const state = await store.get(STATE_KEY, { type: 'json' });
    if (!state || !Array.isArray(state.items)) return json({ ok: false, error: 'Payables state not found' }, 404);
    const stats = await syncPayablesToFinance(state);
    return json({ ok: true, stats });
  } catch (error) {
    console.error('Payables finance sync failed', error instanceof Error ? error.message : error);
    return json({ ok: false, error: 'Payables finance sync failed' }, 500);
  }
};

const STORE_NAME = 'hms-payables';
const STATE_KEY = 'state-v1';
