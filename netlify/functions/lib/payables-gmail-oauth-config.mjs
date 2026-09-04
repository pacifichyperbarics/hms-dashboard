import { env, rest } from './hms-device-session.mjs';
import { decryptSecret, encryptionConfigured } from './hms-oauth-crypto.mjs';

const PURPOSE = 'hms_payables_gmail';
const DEFAULT_REDIRECT_URI = 'https://hms-dashboard-v2.netlify.app/.netlify/functions/payables-gmail-callback';

export function googleOAuthPurpose() {
  return PURPOSE;
}

export function defaultGoogleRedirectUri() {
  return env('HMS_GOOGLE_REDIRECT_URI') || DEFAULT_REDIRECT_URI;
}

export async function resolveGoogleOAuthConfig(databaseConfig) {
  const environment = {
    clientId: env('HMS_GOOGLE_CLIENT_ID'),
    clientSecret: env('HMS_GOOGLE_CLIENT_SECRET'),
    redirectUri: defaultGoogleRedirectUri(),
  };
  if (environment.clientId && environment.clientSecret && encryptionConfigured()) {
    return {
      ...environment,
      configured: true,
      source: 'environment',
      missing: [],
      configId: null,
    };
  }

  let stored = null;
  if (databaseConfig) {
    const query = new URLSearchParams({
      select: '*',
      provider: 'eq.google',
      purpose: `eq.${PURPOSE}`,
      status: 'eq.active',
      limit: '1',
    });
    stored = (await rest(databaseConfig, `hms_finance_integration_configs?${query}`))?.[0] || null;
  }

  if (stored && encryptionConfigured()) {
    const clientSecret = decryptSecret(
      stored.client_secret_ciphertext,
      stored.client_secret_iv,
      `integration-config:google:${PURPOSE}`,
    );
    return {
      clientId: stored.client_id,
      clientSecret,
      redirectUri: stored.redirect_uri || environment.redirectUri,
      configured: Boolean(stored.client_id && clientSecret),
      source: 'encrypted_database',
      missing: [],
      configId: stored.id,
    };
  }

  const missing = [];
  if (!environment.clientId && !stored?.client_id) missing.push('Google client ID');
  if (!environment.clientSecret && !stored?.client_secret_ciphertext) missing.push('Google client secret');
  if (!encryptionConfigured()) missing.push('HMS token-encryption key');
  return {
    clientId: environment.clientId || stored?.client_id || '',
    clientSecret: environment.clientSecret || '',
    redirectUri: stored?.redirect_uri || environment.redirectUri,
    configured: false,
    source: stored ? 'encrypted_database_unavailable' : 'not_configured',
    missing,
    configId: stored?.id || null,
  };
}

export function publicGoogleOAuthStatus(resolved) {
  return {
    configured: Boolean(resolved?.configured),
    source: resolved?.source || 'not_configured',
    clientIdConfigured: Boolean(resolved?.clientId),
    clientSecretConfigured: Boolean(resolved?.clientSecret),
    encryptionConfigured: encryptionConfigured(),
    redirectUri: resolved?.redirectUri || defaultGoogleRedirectUri(),
    missing: Array.isArray(resolved?.missing) ? resolved.missing : [],
    configId: resolved?.configId || null,
  };
}
