import { getStore } from '@netlify/blobs';

function env(name) {
  try { return Netlify.env.get(name) || ''; } catch { return process.env[name] || ''; }
}

async function supabaseCheck() {
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return { configured: false };
  try {
    const response = await fetch(`${url}/rest/v1/hms_finance_accounts?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    return { configured: true, reachable: response.ok, status: response.status };
  } catch {
    return { configured: true, reachable: false, status: 0 };
  }
}

export default async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  let blob = { readable: false, items: 0, runs: 0 };
  try {
    const store = getStore('hms-payables', { consistency: 'strong' });
    const state = await store.get('state-v1', { type: 'json' });
    blob = {
      readable: Boolean(state && Array.isArray(state.items)),
      items: Array.isArray(state?.items) ? state.items.length : 0,
      runs: state?.runs && typeof state.runs === 'object' ? Object.keys(state.runs).length : 0,
    };
  } catch {
    blob = { readable: false, items: 0, runs: 0 };
  }
  const database = await supabaseCheck();
  return Response.json({ ok: blob.readable && database.reachable, blob, database }, {
    headers: { 'cache-control': 'no-store' },
  });
};
