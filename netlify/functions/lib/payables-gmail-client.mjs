import { env } from './hms-device-session.mjs';
import { clean, nullable, stripHtml } from './payables-discovery-rules.mjs';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DEFAULT_REDIRECT_URI = 'https://hms-dashboard-v2.netlify.app/.netlify/functions/payables-gmail-callback';
const REQUEST_TIMEOUT_MS = 20000;

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export function googleOAuthConfig() {
  const clientId = env('HMS_GOOGLE_CLIENT_ID');
  const clientSecret = env('HMS_GOOGLE_CLIENT_SECRET');
  const redirectUri = env('HMS_GOOGLE_REDIRECT_URI') || DEFAULT_REDIRECT_URI;
  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret && redirectUri),
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('google_request_timeout');
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function googleJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error_description || body?.error?.message || body?.error || `google_http_${response.status}`;
    const error = new Error(clean(message, 500));
    error.status = response.status;
    error.googleError = body;
    throw error;
  }
  return body;
}

export function buildAuthorizationUrl({ state, codeChallenge, expectedAccount, redirectUri } = {}) {
  const config = googleOAuthConfig();
  if (!config.configured) throw new Error('google_oauth_not_configured');
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', redirectUri || config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GMAIL_READONLY_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (expectedAccount) url.searchParams.set('login_hint', expectedAccount);
  return url.toString();
}

export async function exchangeAuthorizationCode({ code, codeVerifier, redirectUri }) {
  const config = googleOAuthConfig();
  if (!config.configured) throw new Error('google_oauth_not_configured');
  return googleJson(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri || config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  });
}

export async function refreshGoogleAccessToken(refreshToken) {
  const config = googleOAuthConfig();
  if (!config.configured) throw new Error('google_oauth_not_configured');
  const result = await googleJson(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!result.access_token) throw new Error('google_access_token_missing');
  return result;
}

export async function revokeGoogleToken(token) {
  if (!token) return false;
  const response = await fetchWithTimeout(GOOGLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  });
  return response.ok;
}

async function gmailJson(accessToken, path, params = {}) {
  const url = new URL(`${GMAIL_API}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(key, String(entry)));
    else url.searchParams.set(key, String(value));
  }
  return googleJson(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
}

export async function getGmailProfile(accessToken) {
  return gmailJson(accessToken, 'profile');
}

export async function listInitialMessageIds(accessToken, {
  query = 'newer_than:60d (invoice OR "amount due" OR "balance due" OR "payment due" OR "past due" OR renewal OR statement) -label:spam -label:trash',
  maxMessages = 200,
} = {}) {
  const ids = new Set();
  let pageToken = null;
  let pages = 0;
  do {
    const result = await gmailJson(accessToken, 'messages', {
      q: query,
      maxResults: Math.min(100, maxMessages - ids.size),
      pageToken,
      includeSpamTrash: false,
    });
    for (const message of result.messages || []) if (message?.id) ids.add(message.id);
    pageToken = result.nextPageToken || null;
    pages += 1;
  } while (pageToken && ids.size < maxMessages && pages < 10);
  return [...ids].slice(0, maxMessages);
}

export async function listHistoryMessageIds(accessToken, startHistoryId, { maxMessages = 200 } = {}) {
  const ids = new Set();
  let pageToken = null;
  let latestHistoryId = startHistoryId;
  let pages = 0;
  do {
    const result = await gmailJson(accessToken, 'history', {
      startHistoryId,
      historyTypes: 'messageAdded',
      maxResults: 100,
      pageToken,
    });
    latestHistoryId = result.historyId || latestHistoryId;
    for (const history of result.history || []) {
      for (const added of history.messagesAdded || []) {
        if (added?.message?.id) ids.add(added.message.id);
      }
    }
    pageToken = result.nextPageToken || null;
    pages += 1;
  } while (pageToken && ids.size < maxMessages && pages < 10);
  return { messageIds: [...ids].slice(0, maxMessages), latestHistoryId };
}

export async function getGmailMessage(accessToken, messageId) {
  return gmailJson(accessToken, `messages/${encodeURIComponent(messageId)}`, { format: 'full' });
}

export async function getGmailAttachment(accessToken, messageId, attachmentId) {
  return gmailJson(accessToken, `messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
}

export function decodeBase64Url(data) {
  if (!data) return Buffer.alloc(0);
  return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function headerMap(payload) {
  const result = new Map();
  for (const header of payload?.headers || []) {
    const key = clean(header?.name, 160).toLowerCase();
    if (key && !result.has(key)) result.set(key, clean(header?.value, 2000));
  }
  return result;
}

function walkParts(part, output) {
  if (!part) return;
  const mimeType = clean(part.mimeType, 160).toLowerCase();
  const filename = clean(part.filename, 500);
  const body = part.body || {};
  if (filename || body.attachmentId) {
    output.attachments.push({
      partId: nullable(part.partId, 100),
      attachmentId: nullable(body.attachmentId, 500),
      filename: filename || 'attachment',
      mimeType: mimeType || 'application/octet-stream',
      size: Math.max(0, Number(body.size) || 0),
      inlineData: body.data || null,
    });
  } else if (body.data && mimeType === 'text/plain') {
    output.textParts.push(decodeBase64Url(body.data).toString('utf8'));
  } else if (body.data && mimeType === 'text/html') {
    output.htmlParts.push(decodeBase64Url(body.data).toString('utf8'));
  }
  for (const child of part.parts || []) walkParts(child, output);
}

export function parseGmailMessage(message) {
  const headers = headerMap(message?.payload || {});
  const output = { textParts: [], htmlParts: [], attachments: [] };
  walkParts(message?.payload, output);
  const plain = output.textParts.join('\n\n').trim();
  const htmlText = stripHtml(output.htmlParts.join('\n'));
  const bodyText = clean(plain || htmlText || message?.snippet || '', 20000);
  const receivedAt = message?.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : null;
  return {
    messageId: clean(message?.id, 500),
    threadId: clean(message?.threadId, 500),
    historyId: clean(message?.historyId, 500),
    labelIds: Array.isArray(message?.labelIds) ? message.labelIds.slice(0, 100) : [],
    sender: headers.get('from') || '',
    recipient: headers.get('to') || '',
    subject: headers.get('subject') || '',
    internetMessageId: headers.get('message-id') || '',
    receivedAt,
    snippet: clean(message?.snippet, 2000),
    bodyText,
    attachments: output.attachments,
  };
}
