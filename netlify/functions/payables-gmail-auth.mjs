import { authenticatedDevice, audit, env, rest } from './lib/hms-device-session.mjs';
import {
  decryptSecret,
  encryptSecret,
  encryptionConfigured,
  pkceChallenge,
  randomOpaqueToken,
  stateHash,
} from './lib/hms-oauth-crypto.mjs';
import {
  buildAuthorizationUrl,
  googleOAuthConfig,
  revokeGoogleToken,
} from './lib/payables-gmail-client.mjs';

const EXPECTED_ACCOUNT = 'hms@healtho2.com';
const STATE_TTL_MINUTES = 10;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}
function configuredState() {
  const google = googleOAuthConfig();
  const encryption = encryptionConfigured();
  const missing = [];
  if (!google.clientId) missing.push('HMS_GOOGLE_CLIENT_ID');
  if (!google.clientSecret) missing.push('HMS_GOOGLE_CLIENT_SECRET');
  if (!encryption) missing.push('HMS_FINANCE_TOKEN_ENCRYPTION_KEY');
  return {
    configured: google.configured && encryption,
    clientIdConfigured: Boolean(google.clientId),
    clientSecretConfigured: Boolean(google.clientSecret),
    encryptionConfigured: encryption,
    redirectUri: google.redirectUri,
    missing,
  };
}

async function connectionStatus(config, expectedAccount = EXPECTED_ACCOUNT) {
  const sourceQuery = new URLSearchParams({
    select: 'id,source_key,source_type,display_name,account_identifier,status,last_sync_cursor,last_sync_at,last_success_at,last_error,config,metadata,updated_at',
    source_key: `eq.gmail:${expectedAccount}`,
    limit: '1',
  });
  const credentialQuery = new URLSearchParams({
    select: 'id,provider,account_identifier,ingestion_source_id,scopes,status,last_refresh_at,last_error,revoked_at,metadata,created_at,updated_at',
    provider: 'eq.google',
    account_identifier: `eq.${expectedAccount}`,
    limit: '1',
  });
  const [sources, credentials] = await Promise.all([
    rest(config, `hms_finance_ingestion_sources?${sourceQuery}`),
    rest(config, `hms_finance_oauth_credentials?${credentialQuery}`),
  ]);
  const source = sources?.[0] || null;
  const credential = credentials?.[0] || null;
  return {
    expectedAccount,
    connected: Boolean(source?.status === 'connected' && credential?.status === 'active'),
    source,
    credential,
  };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'method_not_allowed' }, 405);

  let device;
  try {
    device = await authenticatedDevice(req, { requireAdmin: req.method === 'POST' });
    if (!device) return json({ error: req.method === 'POST' ? 'admin_device_required' : 'device_session_required' }, req.method === 'POST' ? 403 : 401);
  } catch (error) {
    return json({ error: 'gmail_connection_status_unavailable', detail: error instanceof Error ? error.message : String(error) }, 503);
  }

  try {
    if (req.method === 'GET') {
      return json({
        ok: true,
        oauth: configuredState(),
        connection: await connectionStatus(device.config),
        device: { id: device.id, isAdmin: device.isAdmin },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 50);
    const expectedAccount = clean(body.account || EXPECTED_ACCOUNT, 300).toLowerCase();
    if (expectedAccount !== EXPECTED_ACCOUNT) return json({ error: 'unsupported_gmail_account', expectedAccount: EXPECTED_ACCOUNT }, 400);

    if (action === 'start') {
      const setup = configuredState();
      if (!setup.configured) return json({ error: 'google_oauth_setup_required', missing: setup.missing, redirectUri: setup.redirectUri }, 503);

      await rest(device.config, 'rpc/hms_finance_cleanup_oauth_states', { method: 'POST', body: {} }).catch(() => undefined);
      const state = randomOpaqueToken(32);
      const stateDigest = stateHash(state);
      const verifier = randomOpaqueToken(64);
      const encryptedVerifier = encryptSecret(verifier, `oauth-state:${stateDigest}`);
      const expiresAt = new Date(Date.now() + STATE_TTL_MINUTES * 60_000).toISOString();
      await rest(device.config, 'hms_finance_oauth_states', {
        method: 'POST',
        prefer: 'return=minimal',
        body: {
          provider: 'google',
          state_hash: stateDigest,
          expected_account: expectedAccount,
          redirect_uri: setup.redirectUri,
          pkce_ciphertext: encryptedVerifier.ciphertext,
          pkce_iv: encryptedVerifier.iv,
          requested_scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
          requested_by_device_id: device.id,
          expires_at: expiresAt,
          metadata: { pkce_method: 'S256', purpose: 'hms_payables_discovery' },
        },
      });

      const authorizationUrl = buildAuthorizationUrl({
        state,
        codeChallenge: pkceChallenge(verifier),
        expectedAccount,
        redirectUri: setup.redirectUri,
      });
      await audit(device.config, 'gmail_oauth_started', 'ingestion_source', `gmail:${expectedAccount}`, device.id, null, null, { expiresAt, scope: 'gmail.readonly' });
      return json({ ok: true, authorizationUrl, expiresAt, expectedAccount });
    }

    if (action === 'disconnect') {
      const status = await connectionStatus(device.config, expectedAccount);
      const credential = status.credential;
      if (!credential) return json({ ok: true, alreadyDisconnected: true });

      const fullQuery = new URLSearchParams({
        select: '*',
        id: `eq.${credential.id}`,
        limit: '1',
      });
      const full = (await rest(device.config, `hms_finance_oauth_credentials?${fullQuery}`))?.[0];
      let providerRevoked = false;
      if (full?.refresh_token_ciphertext && full?.refresh_token_iv && encryptionConfigured()) {
        try {
          const token = decryptSecret(full.refresh_token_ciphertext, full.refresh_token_iv, `oauth-credential:google:${expectedAccount}`);
          providerRevoked = await revokeGoogleToken(token);
        } catch {
          providerRevoked = false;
        }
      }

      const now = new Date().toISOString();
      await rest(device.config, `hms_finance_oauth_credentials?id=eq.${encodeURIComponent(credential.id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { status: 'revoked', revoked_at: now, updated_at: now, last_error: null },
      });
      if (status.source?.id) {
        await rest(device.config, `hms_finance_ingestion_sources?id=eq.${encodeURIComponent(status.source.id)}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: { status: 'not_connected', credential_reference: null, updated_at: now },
        });
      }
      await audit(device.config, 'gmail_oauth_disconnected', 'ingestion_source', `gmail:${expectedAccount}`, device.id, status, null, { providerRevoked });
      return json({ ok: true, disconnected: true, providerRevoked });
    }

    if (action === 'test-decrypt') {
      const status = await connectionStatus(device.config, expectedAccount);
      if (!status.credential || status.credential.status !== 'active') return json({ error: 'gmail_not_connected' }, 409);
      const fullQuery = new URLSearchParams({ select: '*', id: `eq.${status.credential.id}`, limit: '1' });
      const full = (await rest(device.config, `hms_finance_oauth_credentials?${fullQuery}`))?.[0];
      if (!full) return json({ error: 'gmail_credential_missing' }, 404);
      decryptSecret(full.refresh_token_ciphertext, full.refresh_token_iv, `oauth-credential:google:${expectedAccount}`);
      return json({ ok: true, credentialReadable: true });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    console.error('payables-gmail-auth failed', error instanceof Error ? error.message : String(error));
    return json({ error: 'gmail_connection_error', detail: error instanceof Error ? error.message.slice(0, 400) : 'unknown' }, 500);
  }
};
