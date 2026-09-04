import { APP_CONFIG } from './config.js';

function readStorage(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function removeStorage(key) {
  try { localStorage.removeItem(key); } catch {}
}

function token() {
  return readStorage(APP_CONFIG.tokenKey);
}

function deviceId() {
  return readStorage(APP_CONFIG.deviceKey);
}

function clearSession() {
  removeStorage(APP_CONFIG.tokenKey);
}

async function request(url, options = {}) {
  const {
    method = 'GET',
    body,
    timeoutMs = APP_CONFIG.requestTimeoutMs,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token()) headers['x-hms-device-token'] = token();

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.detail || payload.error || `HTTP ${response.status}`);
      error.code = payload.error || 'request_failed';
      error.status = response.status;
      error.detail = payload.detail || null;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('The request timed out.');
      timeoutError.code = 'request_timeout';
      timeoutError.status = 0;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function validateSession() {
  if (!token()) return null;
  try {
    const result = await request(APP_CONFIG.endpoints.auth);
    return result.authenticated ? result.device : null;
  } catch (error) {
    if (error.status === 401 || error.status === 403) clearSession();
    return null;
  }
}

async function login(password) {
  const result = await request(APP_CONFIG.endpoints.auth, {
    method: 'POST',
    body: {
      action: 'login',
      password,
      deviceId: deviceId() || null,
      displayName: '',
      metadata: {
        userAgent: navigator.userAgent || '',
        platform: navigator.userAgentData?.platform || navigator.platform || '',
        language: navigator.language || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        appVersion: APP_CONFIG.version,
      },
    },
  });
  writeStorage(APP_CONFIG.tokenKey, result.token);
  writeStorage(APP_CONFIG.deviceKey, result.device.id);
  return result.device;
}

async function logout() {
  try {
    await request(APP_CONFIG.endpoints.auth, {
      method: 'POST',
      body: { action: 'logout' },
    });
  } catch {}
  clearSession();
}

function getCurrentPayables(month) {
  return request(`${APP_CONFIG.endpoints.currentPayables}?month=${encodeURIComponent(month)}`);
}

function getFinancePayables() {
  return request(APP_CONFIG.endpoints.financePayables);
}

function getInbox() {
  return request(`${APP_CONFIG.endpoints.inbox}?status=all&limit=250`);
}

function addInbox(item) {
  return request(APP_CONFIG.endpoints.inbox, {
    method: 'POST',
    body: { action: 'add', item: { sourceType: 'manual', ...item } },
  });
}

function promoteInbox(id) {
  return request(APP_CONFIG.endpoints.inbox, {
    method: 'POST',
    body: { action: 'promote', id, fields: {} },
  });
}

function rejectInbox(id) {
  return request(APP_CONFIG.endpoints.inbox, {
    method: 'POST',
    body: { action: 'reject', id },
  });
}

function resolveInboxHold(id, note = 'HMS responsibility confirmed.') {
  return request(APP_CONFIG.endpoints.inbox, {
    method: 'POST',
    body: { action: 'resolve-hold', id, note },
  });
}

function setCurrentAuthorization({ id, month, authorized, amount }) {
  return request(APP_CONFIG.endpoints.currentPayables, {
    method: 'POST',
    body: { action: 'set-authorization', id, month, authorized, amount },
  });
}

function setFinanceAuthorization({ id, authorized, amount }) {
  return request(APP_CONFIG.endpoints.financePayables, {
    method: 'POST',
    body: authorized
      ? { action: 'authorize', id, amount }
      : { action: 'revoke-authorization', id },
  });
}

function getGmailStatus() {
  return request(APP_CONFIG.endpoints.gmail, { timeoutMs: 12000 });
}

export const api = Object.freeze({
  request,
  token,
  clearSession,
  validateSession,
  login,
  logout,
  getCurrentPayables,
  getFinancePayables,
  getInbox,
  addInbox,
  promoteInbox,
  rejectInbox,
  resolveInboxHold,
  setCurrentAuthorization,
  setFinanceAuthorization,
  getGmailStatus,
});
