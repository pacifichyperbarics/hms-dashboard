import { authenticatedDevice } from './lib/hms-device-session.mjs';
import { startGmailOAuth } from './lib/payables-gmail-auth.mjs';
import {
  activeGmailConnections,
  gmailDiscoveryStatus,
  scanGmailConnection,
  setGmailConnectionStatus,
} from './lib/payables-gmail-scanner.mjs';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function errorResponse(error) {
  const detail = clean(error instanceof Error ? error.message : error, 500);
  const code = clean(detail.split(':')[0], 120) || 'gmail_discovery_error';
  const status = code.includes('not_configured') || code.includes('missing') ? 503
    : code.includes('not_found') ? 404
      : code.includes('not_active') || code.includes('invalid_connection_status') ? 409
        : 500;
  return json({ error: code, detail }, status);
}

async function connectionById(connectionId) {
  const connections = await activeGmailConnections();
  return connectionId
    ? connections.find((connection) => connection.id === connectionId) || null
    : connections[0] || null;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'method_not_allowed' }, 405);

  try {
    const device = await authenticatedDevice(req, { requireAdmin: req.method === 'POST' });
    if (!device) {
      return json(
        { error: req.method === 'POST' ? 'admin_device_required' : 'device_session_required' },
        req.method === 'POST' ? 403 : 401,
      );
    }

    if (req.method === 'GET') {
      return json({ ok: true, ...(await gmailDiscoveryStatus()), device: { id: device.id, isAdmin: device.isAdmin } });
    }

    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 60);

    if (action === 'start-connect') {
      const oauth = await startGmailOAuth(req, device);
      return json({ ok: true, ...oauth });
    }

    if (action === 'scan') {
      const connectionId = clean(body.connectionId, 80);
      const connection = await connectionById(connectionId);
      if (!connection) return json({ error: 'gmail_connection_not_found' }, 404);
      const scan = await scanGmailConnection(connection, {
        triggerType: 'manual',
        maxMessages: Math.max(10, Math.min(100, Number(body.maxMessages) || 75)),
        deviceId: device.id,
      });
      return json({ ok: true, scan, ...(await gmailDiscoveryStatus()) });
    }

    if (['pause', 'resume', 'disconnect'].includes(action)) {
      const connectionId = clean(body.connectionId, 80);
      if (!connectionId) return json({ error: 'connection_id_required' }, 400);
      const status = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'disconnected';
      const connection = await setGmailConnectionStatus(connectionId, status, device.id);
      return json({ ok: true, connection, ...(await gmailDiscoveryStatus()) });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    console.error('payables-gmail failed', error instanceof Error ? error.message : 'unknown_error');
    return errorResponse(error);
  }
};

export const config = {
  path: '/api/hms-payables/gmail',
};
