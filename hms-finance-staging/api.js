(() => {
  const base = 'https://sojtoyybfolcxezkppxc.supabase.co/functions/v1';
  const endpoints = {
    auth: `${base}/hms-device-auth`,
    intake: `${base}/hms-finance-intake`,
    reporting: `${base}/hms-finance-reporting`,
    payables: `${base}/hms-finance-payables`,
    payments: `${base}/hms-finance-payments`,
    optimization: `${base}/hms-finance-optimization`,
    qc: `${base}/hms-finance-qc`,
    currentPayables: '/.netlify/functions/payables-current',
    gmail: '/api/hms-payables/gmail',
    legacySync: '/.netlify/functions/payables-finance-sync',
  };
  const TOKEN_KEY = 'hms.device.token.v1';
  const DEVICE_KEY = 'hms.device.id.v1';

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }
  function deviceId() {
    try { return localStorage.getItem(DEVICE_KEY) || ''; } catch { return ''; }
  }
  function saveSession(result) {
    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(DEVICE_KEY, result.device.id);
  }
  function clearSession() {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
  }

  async function request(url, method = 'GET', body, timeoutMs = 20000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { 'Content-Type': 'application/json' };
    if (token()) headers['x-hms-device-token'] = token();
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || 'request_failed');
        error.code = data.error;
        error.status = response.status;
        error.detail = data.detail;
        error.callbackUrl = data.callbackUrl;
        error.requiredEnvironmentVariables = data.requiredEnvironmentVariables;
        throw error;
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('request_timeout');
        timeoutError.code = 'request_timeout';
        timeoutError.detail = 'The request timed out.';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function validate() {
    if (!token()) return null;
    try {
      const result = await request(endpoints.auth);
      return result.authenticated ? result.device : null;
    } catch (error) {
      if (error.status === 401 || error.status === 403) clearSession();
      return null;
    }
  }

  async function login(password) {
    const result = await request(endpoints.auth, 'POST', {
      action: 'login',
      password,
      deviceId: deviceId() || null,
      displayName: '',
      metadata: {
        userAgent: navigator.userAgent || '',
        platform: navigator.userAgentData?.platform || navigator.platform || '',
        language: navigator.language || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      },
    });
    saveSession(result);
    return result.device;
  }

  async function logout() {
    try { await request(endpoints.auth, 'POST', { action: 'logout' }); } catch {}
    clearSession();
  }

  window.HMSFinanceAPI = { endpoints, request, validate, login, logout, token, deviceId, clearSession };
})();
