/** WebCrypto helpers (Deno + Node 22): hashing, payload encryption, webhook signatures. */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export const base64ToBytes = (b64: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const toHex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Peppered SHA-256 — identifies a recipient without storing the number or address. */
export const hashIdentifier = async (pepper: string, value: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', enc.encode(`${pepper}:${value}`)));

const hmacKey = (secret: Uint8Array<ArrayBuffer> | string, hash: 'SHA-256' | 'SHA-1') =>
  crypto.subtle.importKey('raw', typeof secret === 'string' ? enc.encode(secret) : secret, { name: 'HMAC', hash }, false, ['sign']);

export const hmacSha256Hex = async (secret: string, data: string): Promise<string> =>
  toHex(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'SHA-256'), enc.encode(data)));

export const hmacSha256Base64 = async (secret: Uint8Array<ArrayBuffer> | string, data: string): Promise<string> =>
  bytesToBase64(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'SHA-256'), enc.encode(data))));

export const hmacSha1Base64 = async (secret: string, data: string): Promise<string> =>
  bytesToBase64(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'SHA-1'), enc.encode(data))));

/** Constant-time string comparison. */
export const safeEqual = (a: string, b: string): boolean => {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

const aesKey = async (keyB64: string, usage: 'encrypt' | 'decrypt') => {
  const raw = base64ToBytes(keyB64);
  if (raw.length !== 32) throw new Error('MESSAGE_PAYLOAD_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [usage]);
};

/** AES-256-GCM; output "v1.<iv>.<ciphertext>" in base64. */
export const encryptJson = async (keyB64: string, value: unknown): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyB64, 'encrypt'), enc.encode(JSON.stringify(value)));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ct))}`;
};

export const decryptJson = async <T>(keyB64: string, payload: string): Promise<T> => {
  const [version, ivB64, ctB64] = payload.split('.');
  if (version !== 'v1' || !ivB64 || !ctB64) throw new Error('Unsupported payload format');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(ivB64) }, await aesKey(keyB64, 'decrypt'), base64ToBytes(ctB64));
  return JSON.parse(dec.decode(pt)) as T;
};
