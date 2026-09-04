import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { authenticatedDevice, env, rest } from './lib/hms-device-session.mjs';

const CATEGORIES = new Set(['email', 'text', 'whatsapp', 'ai', 'saas', 'other']);
const AUTH_METHODS = new Set(['password', 'google_sso', 'microsoft_sso', 'apple_sso', 'phone_code', 'oauth', 'api_key', 'passkey', 'unknown', 'none']);
const STATUSES = new Set(['connected', 'needs_details', 'needs_verification', 'disabled']);

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function nullable(value, max = 500) {
  const result = clean(value, max);
  return result || null;
}

function validUrl(value) {
  const text = clean(value, 1000);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function vaultKey() {
  const encoded = env('CONNECTIVITY_VAULT_KEY_V1').trim();
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('connectivity_vault_key_invalid');
  return key;
}

function encryptSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', vaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return {
    version: 1,
    algorithm: 'AES-256-GCM',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

function decryptSecret(envelope) {
  if (!envelope || envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM') {
    throw new Error('credential_not_stored');
  }
  const decipher = createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function publicAccount(row) {
  return {
    id: row.id,
    category: row.category,
    serviceName: row.service_name,
    loginId: row.login_id,
    loginUrl: row.login_url,
    authMethod: row.auth_method,
    passwordHint: row.password_hint,
    ownerLabel: row.owner_label,
    status: row.status,
    notes: row.notes,
    lastVerifiedAt: row.last_verified_at,
    sortOrder: row.sort_order,
    secretPresent: Boolean(row.secret_envelope),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function auditSnapshot(row) {
  if (!row) return null;
  return {
    ...publicAccount(row),
    secretPresent: Boolean(row.secret_envelope),
  };
}

async function audit(config, action, entityId, deviceId, beforeState = null, afterState = null, metadata = {}) {
  try {
    await rest(config, 'hms_audit_log', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        capability_id: 'hms-connectivity',
        action,
        entity_type: 'connectivity_account',
        entity_id: entityId,
        before_state: beforeState,
        after_state: afterState,
        metadata: { ...metadata, deviceId },
      },
    });
  } catch (error) {
    console.error('Connectivity audit write failed', error instanceof Error ? error.message : String(error));
  }
}

async function findAccount(config, id) {
  const query = new URLSearchParams({
    select: '*',
    id: `eq.${id}`,
    archived_at: 'is.null',
    limit: '1',
  });
  const rows = await rest(config, `hms_connectivity_accounts?${query}`);
  return rows?.[0] || null;
}

async function listAccounts(config) {
  const query = new URLSearchParams({
    select: '*',
    archived_at: 'is.null',
    order: 'category.asc,sort_order.asc,service_name.asc',
  });
  return rest(config, `hms_connectivity_accounts?${query}`);
}

function saveFields(body, existing = null) {
  const category = clean(body.category, 30) || existing?.category || 'saas';
  const authMethod = clean(body.authMethod, 40) || existing?.auth_method || 'unknown';
  const status = clean(body.status, 40) || existing?.status || 'needs_details';
  const serviceName = clean(body.serviceName, 200) || existing?.service_name || '';
  if (!serviceName) throw new Error('service_name_required');
  if (!CATEGORIES.has(category)) throw new Error('invalid_category');
  if (!AUTH_METHODS.has(authMethod)) throw new Error('invalid_auth_method');
  if (!STATUSES.has(status)) throw new Error('invalid_status');

  const suppliedUrl = clean(body.loginUrl, 1000);
  const loginUrl = suppliedUrl ? validUrl(suppliedUrl) : null;
  if (suppliedUrl && !loginUrl) throw new Error('invalid_login_url');

  const fields = {
    category,
    service_name: serviceName,
    login_id: nullable(body.loginId, 300),
    login_url: loginUrl,
    auth_method: authMethod,
    password_hint: nullable(body.passwordHint, 300),
    owner_label: nullable(body.ownerLabel, 200),
    status,
    notes: nullable(body.notes, 2000),
    sort_order: Number.isInteger(Number(body.sortOrder)) ? Math.max(0, Math.min(10000, Number(body.sortOrder))) : (existing?.sort_order ?? 100),
    updated_at: new Date().toISOString(),
  };

  if (body.markVerified === true) fields.last_verified_at = new Date().toISOString();
  else if ('lastVerifiedAt' in body) fields.last_verified_at = body.lastVerifiedAt ? new Date(body.lastVerifiedAt).toISOString() : null;

  if (body.clearSecret === true) fields.secret_envelope = null;
  else if (typeof body.secret === 'string' && body.secret.length > 0) fields.secret_envelope = encryptSecret(body.secret);

  return fields;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'method_not_allowed' }, 405);

  try {
    const device = await authenticatedDevice(req);
    if (!device) return json({ error: 'device_session_required' }, 401);
    if (!device.isAdmin) return json({ error: 'admin_device_required' }, 403);

    if (req.method === 'GET') {
      const rows = await listAccounts(device.config);
      return json({
        ok: true,
        accounts: (rows || []).map(publicAccount),
        device: { id: device.id, displayName: device.displayName, isAdmin: device.isAdmin },
        checkedAt: new Date().toISOString(),
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 40);

    if (action === 'reveal') {
      const id = clean(body.id, 80);
      if (!id) return json({ error: 'id_required' }, 400);
      const account = await findAccount(device.config, id);
      if (!account) return json({ error: 'account_not_found' }, 404);
      if (!account.secret_envelope) return json({ error: 'credential_not_stored' }, 404);
      const secret = decryptSecret(account.secret_envelope);
      await audit(device.config, 'credential_revealed', id, device.id, null, null, {
        serviceName: account.service_name,
        loginId: account.login_id,
      });
      return json({ ok: true, id, secret });
    }

    if (action === 'save') {
      const id = clean(body.id, 80);
      if (id) {
        const before = await findAccount(device.config, id);
        if (!before) return json({ error: 'account_not_found' }, 404);
        const fields = saveFields(body, before);
        const query = new URLSearchParams({ id: `eq.${id}` });
        const rows = await rest(device.config, `hms_connectivity_accounts?${query}`, {
          method: 'PATCH',
          body: fields,
          prefer: 'return=representation',
        });
        const after = rows?.[0];
        await audit(device.config, 'connectivity_account_updated', id, device.id, auditSnapshot(before), auditSnapshot(after), {
          secretUpdated: Object.prototype.hasOwnProperty.call(fields, 'secret_envelope'),
        });
        return json({ ok: true, account: publicAccount(after) });
      }

      const fields = saveFields(body);
      fields.created_at = new Date().toISOString();
      const rows = await rest(device.config, 'hms_connectivity_accounts', {
        method: 'POST',
        body: fields,
        prefer: 'return=representation',
      });
      const created = rows?.[0];
      await audit(device.config, 'connectivity_account_created', created.id, device.id, null, auditSnapshot(created), {
        secretStored: Boolean(created.secret_envelope),
      });
      return json({ ok: true, account: publicAccount(created) }, 201);
    }

    if (action === 'verify') {
      const id = clean(body.id, 80);
      if (!id) return json({ error: 'id_required' }, 400);
      const before = await findAccount(device.config, id);
      if (!before) return json({ error: 'account_not_found' }, 404);
      const now = new Date().toISOString();
      const query = new URLSearchParams({ id: `eq.${id}` });
      const rows = await rest(device.config, `hms_connectivity_accounts?${query}`, {
        method: 'PATCH',
        body: { status: 'connected', last_verified_at: now, updated_at: now },
        prefer: 'return=representation',
      });
      const after = rows?.[0];
      await audit(device.config, 'connectivity_account_verified', id, device.id, auditSnapshot(before), auditSnapshot(after));
      return json({ ok: true, account: publicAccount(after) });
    }

    if (action === 'archive') {
      const id = clean(body.id, 80);
      if (!id) return json({ error: 'id_required' }, 400);
      const before = await findAccount(device.config, id);
      if (!before) return json({ error: 'account_not_found' }, 404);
      const now = new Date().toISOString();
      const query = new URLSearchParams({ id: `eq.${id}` });
      await rest(device.config, `hms_connectivity_accounts?${query}`, {
        method: 'PATCH',
        body: { archived_at: now, updated_at: now },
        prefer: 'return=minimal',
      });
      await audit(device.config, 'connectivity_account_archived', id, device.id, auditSnapshot(before), null);
      return json({ ok: true, id });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('connectivity-vault failed', message);
    if (['service_name_required', 'invalid_category', 'invalid_auth_method', 'invalid_status', 'invalid_login_url'].includes(message)) {
      return json({ error: message }, 400);
    }
    if (message.includes('duplicate key')) return json({ error: 'duplicate_account' }, 409);
    if (message === 'credential_not_stored') return json({ error: message }, 404);
    return json({ error: 'connectivity_vault_unavailable', detail: message }, 500);
  }
};
