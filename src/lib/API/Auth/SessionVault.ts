import { Err } from '$domain/errors';
import { dbPromise, APP_TABLE_NAME } from '../localDB';

// TODO:mobile Use platform secure storage (Keychain/SecureStorage) for vault key and entries

// TODO:auth:security consider adding a refresh endpoint on the server (that will exist one day)
const VAULT_PREFIX = 'session:'; // Stored under APP table
const KEY_STORAGE = 'wf.vault.key.v1'; // localStorage key for JWK

async function ensureKey(): Promise<CryptoKey> {
  // Web-only guard
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('SessionVault unavailable in non-browser context');
  }

  const jwkStr = localStorage.getItem(KEY_STORAGE);
  if (jwkStr) {
    const jwk = JSON.parse(jwkStr);
    return await crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('jwk', key);
  try {
    localStorage.setItem(KEY_STORAGE, JSON.stringify(exported));
  } catch (e) { Err.UNHANDLED(e) }
  return key;
}

function toB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function fromB64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function encrypt(text: string): Promise<string> {
  const key = await ensureKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const cipher = new Uint8Array(buf);
  return `v1.${toB64(iv)}.${toB64(cipher)}`;
}

async function decrypt(payload: string): Promise<string> {
  const [v, ivB64, cipherB64] = payload.split('.');
  if (v !== 'v1') throw new Error('Unsupported vault payload');
  const key = await ensureKey();
  const iv = fromB64(ivB64);
  const cipher = fromB64(cipherB64);
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(new Uint8Array(buf));
}

export const SessionVault = {
  save: async (userId: string, refreshToken: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    const payload = await encrypt(refreshToken);
    await db.put(APP_TABLE_NAME, payload, `${VAULT_PREFIX}${userId}`);
  },
  get: async (userId: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    const db = await dbPromise;
    const payload = (await db.get(APP_TABLE_NAME, `${VAULT_PREFIX}${userId}`)) as string | undefined;
    if (!payload) return null;
    try {
      return await decrypt(payload);
    } catch {
      return null;
    }
  },
  remove: async (userId: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    await db.delete(APP_TABLE_NAME, `${VAULT_PREFIX}${userId}`);
  },
};

export default SessionVault;


