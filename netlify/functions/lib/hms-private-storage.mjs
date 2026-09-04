const DEFAULT_TIMEOUT_MS = 20000;

function encodePath(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

async function storageRequest(config, path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!config?.url || !config?.key) throw new Error('supabase_storage_not_configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.url}/storage/v1/${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const error = new Error(`storage_request_failed:${response.status}:${detail.slice(0, 300)}`);
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    return response.json().catch(() => null);
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('storage_request_timeout');
      timeout.status = 408;
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadPrivateObject(config, bucket, path, bytes, mimeType, { upsert = false } = {}) {
  return storageRequest(config, `object/${encodeURIComponent(bucket)}/${encodePath(path)}`, {
    method: 'POST',
    headers: {
      'content-type': mimeType || 'application/octet-stream',
      'x-upsert': upsert ? 'true' : 'false',
    },
    body: bytes,
  });
}

export async function deletePrivateObject(config, bucket, path) {
  try {
    return await storageRequest(config, `object/${encodeURIComponent(bucket)}/${encodePath(path)}`, { method: 'DELETE' });
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

export async function createPrivateSignedUrl(config, bucket, path, expiresInSeconds = 600) {
  const result = await storageRequest(config, `object/sign/${encodeURIComponent(bucket)}/${encodePath(path)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  const relative = result?.signedURL || result?.signedUrl || null;
  if (!relative) throw new Error('signed_url_missing');
  return relative.startsWith('http') ? relative : `${config.url}/storage/v1${relative}`;
}
