import { createHash } from 'node:crypto';

const REQUEST_TIMEOUT_MS = 10000;

export function env(name) {
  try { return Netlify.env.get(name) || ''; } catch { return process.env[name] || ''; }
}

export function supabaseConfig() {
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  return url && key ? { url, key } : null;
}

export async function rest(config, path, { method = 'GET', body, prefer = '' } = {}) {
  if (!config) throw new Error('supabase_not_configured');
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

export async function authenticatedDevice(req, { requireAdmin = false } = {}) {
  const token = String(req.headers.get('x-hms-device-token') || '').trim();
  if (!token) return null;

  const config = supabaseConfig();
  if (!config) throw new Error('supabase_not_configured');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const sessionQuery = new URLSearchParams({
    select: 'id,device_id,expires_at,revoked_at',
    token_hash: `eq.${tokenHash}`,
    limit: '1',
  });
  const sessions = await rest(config, `hms_device_sessions?${sessionQuery}`);
  const session = sessions?.[0];
  if (!session || session.revoked_at) return null;
  if (session.expires_at && session.expires_at <= new Date().toISOString()) return null;

  const deviceQuery = new URLSearchParams({
    select: 'id,display_name,allowed,is_admin,assigned_user_id',
    id: `eq.${session.device_id}`,
    limit: '1',
  });
  const devices = await rest(config, `hms_devices?${deviceQuery}`);
  const device = devices?.[0];
  if (!device?.allowed || (requireAdmin && !device.is_admin)) return null;

  const now = new Date().toISOString();
  await Promise.allSettled([
    rest(config, `hms_device_sessions?id=eq.${encodeURIComponent(session.id)}`, {
      method: 'PATCH', body: { last_seen_at: now }, prefer: 'return=minimal',
    }),
    rest(config, `hms_devices?id=eq.${encodeURIComponent(device.id)}`, {
      method: 'PATCH', body: { last_seen_at: now, updated_at: now }, prefer: 'return=minimal',
    }),
  ]);

  return {
    id: device.id,
    displayName: device.display_name || null,
    isAdmin: Boolean(device.is_admin),
    assignedUserId: device.assigned_user_id || null,
    config,
  };
}

export async function audit(config, action, entityType, entityId, deviceId, beforeState = null, afterState = null, metadata = {}) {
  try {
    await rest(config, 'hms_audit_log', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        capability_id: 'finance.payables',
        action,
        entity_type: entityType,
        entity_id: entityId,
        before_state: beforeState,
        after_state: afterState,
        metadata: { ...metadata, deviceId },
      },
    });
  } catch (error) {
    console.error('HMS audit write failed', error instanceof Error ? error.message : String(error));
  }
}
