import { safeStorage } from 'electron';
import { store } from './store';

let memoryToken: string | undefined;
export function persistentCredentialsAvailable(): boolean {
  return safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
}
export function saveRefreshToken(token?: string): void {
  memoryToken = token;
  const auth = { ...store.get('auth') };
  delete auth.refreshToken;
  delete auth.encryptedRefreshToken;
  if (token && persistentCredentialsAvailable()) auth.encryptedRefreshToken = safeStorage.encryptString(token).toString('base64');
  store.set('auth', auth);
}
export function readRefreshToken(): string | undefined {
  if (memoryToken) return memoryToken;
  const auth = store.get('auth');
  if (auth.refreshToken) { saveRefreshToken(auth.refreshToken); return memoryToken; }
  if (auth.encryptedRefreshToken && persistentCredentialsAvailable()) {
    try { memoryToken = safeStorage.decryptString(Buffer.from(auth.encryptedRefreshToken, 'base64')); }
    catch { return undefined; }
  }
  return memoryToken;
}
