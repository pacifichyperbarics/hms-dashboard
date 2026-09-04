import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from './hms-device-session.mjs';

const ALGORITHM = 'aes-256-gcm';

function encryptionKey() {
  const secret = env('HMS_FINANCE_TOKEN_ENCRYPTION_KEY');
  if (!secret) throw new Error('finance_token_encryption_key_missing');
  return createHash('sha256').update(secret, 'utf8').digest();
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function fromBase64url(value) {
  return Buffer.from(String(value || ''), 'base64url');
}

export function encryptionConfigured() {
  return Boolean(env('HMS_FINANCE_TOKEN_ENCRYPTION_KEY'));
}

export function randomOpaqueToken(bytes = 32) {
  return base64url(randomBytes(bytes));
}

export function stateHash(state) {
  return createHash('sha256').update(String(state), 'utf8').digest('hex');
}

export function pkceChallenge(verifier) {
  return base64url(createHash('sha256').update(String(verifier), 'utf8').digest());
}

export function encryptSecret(plaintext, context = '') {
  if (!plaintext) throw new Error('secret_plaintext_required');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  if (context) cipher.setAAD(Buffer.from(String(context), 'utf8'));
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: base64url(Buffer.concat([encrypted, tag])),
    iv: base64url(iv),
    algorithm: ALGORITHM,
  };
}

export function decryptSecret(ciphertext, iv, context = '') {
  const combined = fromBase64url(ciphertext);
  if (combined.length < 17) throw new Error('encrypted_secret_invalid');
  const encrypted = combined.subarray(0, combined.length - 16);
  const tag = combined.subarray(combined.length - 16);
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), fromBase64url(iv));
  if (context) decipher.setAAD(Buffer.from(String(context), 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
