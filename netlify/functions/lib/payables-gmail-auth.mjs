import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { audit, env, rest, supabaseConfig } from './hms-device-session.mjs';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPES = 'openid email https://www.googleapis.com/auth/gmail.readonly';
const REQUEST_TIMEOUT_MS = 12000;

function clean(value, max = 1000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function b64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function oauthConfig() {
  const clientId = env('HMS_GOOGLE_CLIENT_ID').trim() || env('GOOGLE_CLIENT_ID').trim();
  const clientSecret = env('HMS_GOOGLE_CLIENT_SECRET').trim() || env('GOOGLE_CLIENT_SECRET').trim();
  const tokenKeyReady = Boolean(env('HMS_GMAIL_TOKEN_KEY').trim());
  const missing = [
    !clientId ? 'Google client ID' : null,
    !clientSecret ? 'Google client secret' : null,
    !tokenKeyReady ? 'Gmail token encryption key' : null,
  ].filter(Boolean);
  return { clientId, clientSecret, tokenKeyReady, missing, configured: missing.length === 0 };
}

export function gmailConfigurationStatus() {
  const config = oauthConfig();
  const explicitRedirect = env('HMS_GMAIL_REDIRECT_URI').trim();
  const site = env('URL').trim().replace(/\/$/, '');
  return {
    configured: config.configured,
    missing: config.missing,
    redirectUri: explicitRedirect || (site ? `${site}/api/hms-payables/gmail/callback` : null),
  };
}

function tokenKey() {
  const encoded = env('HMS_GMAIL_TOKEN_KEY').trim();
  if (!encoded) throw new Error('gmail_token_key_missing');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('gmail_token_key_invalid');
  return key;
}

function encryptRefreshToken(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `v1:${b64url(iv)}:${b64url(cipher.getAuthTag())}:${b64url(ciphertext)}`;
}

function decryptRefreshToken(value) {
  const [version, iv, tag, ciphertext] = String(value || '').split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('gmail_credential_format_invalid');
  const decipher = createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function callbackUri(req) {
  const explicit = env('HMS_GMAIL_REDIRECT_URI').trim();
  if (explicit) return explicit;
  const site = env('URL').trim().replace(/\/$/, '');
  return site ? `${site}/api/hms-payables/gmail/callback` : `${new URL(req.url).origin}/api/hms-payables/gmail/callback`;
}

async function fetchJson(url, options, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = clean(body?.error_description || body?.error?.message || body?.error || response.statusText, 500);
      const error = new Error(`${label}_failed:${response.status}:${detail}`);
      error.status = response.status;
      throw error;
    }
    return body;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${label}_timeout`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function tokenRequest(values, label) {
  const config = oauthConfig();
  if (!config.configured) throw new Error(`gmail_oauth_not_configured:${config.missing.join(', ')}`);
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...values,
  });
  return fetchJson(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  }, label);
}

async function gmailProfile(accessToken) {
  return fetchJson('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { authorization: `Bearer ${accessToken}` },
  }, 'gmail_profile');
}

export async function startGmailOAuth(req, device) {
  const database = supabaseConfig();
  const oauth = oauthConfig();
  if (!database) throw new Error('supabase_not_configured');
  if (!oauth.configured) throw new Error(`gmail_oauth_not_configured:${oauth.missing.join(', ')}`);

  const state = b64url(randomBytes(32));
  const verifier = b64url(randomBytes(64));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const redirectUri = callbackUri(req);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await rest(database, 'hms_finance_oauth_states', {
    method: 'POST',
    body: {
      state_hash: sha256(state),
      connector_type: 'gmail',
      device_id: device.id,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      return_path: '/hms-payables/?gmail=connected#settings',
      expires_at: expiresAt,
    },
    prefer: 'return=minimal',
  });

  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set('client_id', oauth.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  await audit(database, 'gmail_oauth_started', 'source_connection', null, device.id, null, null, {
    redirectUri,
    expiresAt,
  });
  return { authorizationUrl: url.toString(), expiresAt };
}

export async function completeGmailOAuth(req) {
  const database = supabaseConfig();
  if (!database) throw new Error('supabase_not_configured');
  const url = new URL(req.url);
  const state = clean(url.searchParams.get('state'), 500);
  const code = clean(url.searchParams.get('code'), 4000);
  const oauthError = clean(url.searchParams.get('error'), 200);
  if (oauthError) throw new Error(`gmail_oauth_denied:${oauthError}`);
  if (!state || !code) throw new Error('gmail_oauth_callback_missing_code');

  const rows = await rest(database, `hms_finance_oauth_states?select=*&state_hash=eq.${encodeURIComponent(sha256(state))}&limit=1`);
  const oauthState = rows?.[0];
  if (!oauthState || oauthState.used_at) throw new Error('gmail_oauth_state_invalid');
  if (oauthState.expires_at <= new Date().toISOString()) throw new Error('gmail_oauth_state_expired');

  const tokens = await tokenRequest({
    code,
    code_verifier: oauthState.code_verifier,
    grant_type: 'authorization_code',
    redirect_uri: oauthState.redirect_uri,
  }, 'gmail_token_exchange');
  if (!tokens.refresh_token) throw new Error('gmail_refresh_token_missing');

  const profile = await gmailProfile(tokens.access_token);
  const sourceAccount = clean(profile.emailAddress, 300).toLowerCase();
  if (!sourceAccount) throw new Error('gmail_profile_email_missing');

  const connectionRows = await rest(database, 'hms_finance_source_connections?on_conflict=connector_type,source_account', {
    method: 'POST',
    body: {
      connector_type: 'gmail',
      source_account: sourceAccount,
      display_name: sourceAccount,
      status: 'active',
      scopes: clean(tokens.scope, 2000).split(/\s+/).filter(Boolean),
      history_cursor: null,
      connected_by_device_id: oauthState.device_id,
      error_text: null,
      config: {
        initial_query: null,
        initial_backfill_days: 60,
        max_messages_per_scan: 75,
      },
      metadata: {
        google_profile_history_id: String(profile.historyId || ''),
        oauth_connected_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    },
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  const connection = connectionRows?.[0];
  if (!connection?.id) throw new Error('gmail_connection_upsert_failed');

  await rest(database, 'hms_finance_connector_credentials?on_conflict=connection_id', {
    method: 'POST',
    body: {
      connection_id: connection.id,
      refresh_token_ciphertext: encryptRefreshToken(tokens.refresh_token),
      encryption_version: 1,
      token_fingerprint: sha256(tokens.refresh_token).slice(0, 20),
      last_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });

  await rest(database, `hms_finance_oauth_states?state_hash=eq.${encodeURIComponent(oauthState.state_hash)}`, {
    method: 'PATCH',
    body: { used_at: new Date().toISOString() },
    prefer: 'return=minimal',
  });
  await audit(database, 'gmail_connected', 'source_connection', connection.id, oauthState.device_id, null, {
    sourceAccount,
    status: 'active',
  });

  return {
    connection,
    returnPath: oauthState.return_path || '/hms-payables/?gmail=connected#settings',
  };
}

export async function accessTokenForConnection(database, connection) {
  const rows = await rest(database, `hms_finance_connector_credentials?select=*&connection_id=eq.${encodeURIComponent(connection.id)}&limit=1`);
  const credential = rows?.[0];
  if (!credential?.refresh_token_ciphertext) throw new Error('gmail_connection_credentials_missing');
  const refreshToken = decryptRefreshToken(credential.refresh_token_ciphertext);
  const tokens = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' }, 'gmail_token_refresh');
  await rest(database, `hms_finance_connector_credentials?connection_id=eq.${encodeURIComponent(connection.id)}`, {
    method: 'PATCH',
    body: { last_refreshed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    prefer: 'return=minimal',
  });
  return tokens.access_token;
}
