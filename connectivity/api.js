(() => {
  const authEndpoint = 'https://sojtoyybfolcxezkppxc.supabase.co/functions/v1/hms-device-auth';
  const vaultEndpoint = '/.netlify/functions/connectivity-vault';
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
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || 'request_failed');
        error.code = data.error || 'request_failed';
        error.status = response.status;
        error.detail = data.detail || '';
        throw error;
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('request_timeout');
        timeoutError.code = 'request_timeout';
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
      const result = await request(authEndpoint);
      return result.authenticated ? result.device : null;
    } catch (error) {
      if (error.status === 401 || error.status === 403) clearSession();
      return null;
    }
  }

  async function login(password) {
    const result = await request(authEndpoint, 'POST', {
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
    try { await request(authEndpoint, 'POST', { action: 'logout' }); } catch {}
    clearSession();
  }

  async function list() {
    return request(vaultEndpoint);
  }

  async function save(fields) {
    return request(vaultEndpoint, 'POST', { action: 'save', ...fields });
  }

  async function reveal(id) {
    return request(vaultEndpoint, 'POST', { action: 'reveal', id });
  }

  async function verify(id) {
    return request(vaultEndpoint, 'POST', { action: 'verify', id });
  }

  async function archive(id) {
    return request(vaultEndpoint, 'POST', { action: 'archive', id });
  }

  window.HMSConnectivityAPI = { validate, login, logout, list, save, reveal, verify, archive, clearSession };
})();
