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

function serverSecretAuthorized(req) {
  const expected = env('HMS_PAYABLES_SHADOW_TOKEN');
  if (!expected) return false;
  const auth = req.headers.get('authorization') || '';
  const header = req.headers.get('x-hms-shadow-token') || '';
  return auth === `Bearer ${expected}` || header === expected;
}

async function adminDeviceAuthorized(req) {
  const token = String(req.headers.get('x-hms-device-token') || '').trim();
  if (!token) return false;
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return false;
  const hash = createHash('sha256').update(token).digest('hex');
  const query = new URLSearchParams({
    select: 'id,device_id,expires_at,revoked_at,hms_devices!inner(id,allowed,is_admin)',
    token_hash: `eq.${hash}`,
    limit: '1',
  });
  const response = await fetch(`${url}/rest/v1/hms_device_sessions?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!response.ok) return false;
  const rows = await response.json().catch(() => []);
  const session = rows?.[0];
  if (!session || session.revoked_at) return false;
  if (session.expires_at && session.expires_at <= new Date().toISOString()) return false;
  const device = Array.isArray(session.hms_devices) ? session.hms_devices[0] : session.hms_devices;
  return Boolean(device?.allowed && device?.is_admin);
}

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  let authorized = serverSecretAuthorized(req);
  if (!authorized) {
    try { authorized = await adminDeviceAuthorized(req); } catch { authorized = false; }
  }
  if (!authorized) return json({ ok: false, error: 'Admin device required' }, 403);

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
