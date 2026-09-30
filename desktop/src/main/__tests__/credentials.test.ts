import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>, encrypted: true, backend: 'dpapi', hasBackendMethod: true,
  encrypt: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
  decrypt: vi.fn((value: Buffer) => value.toString().replace('encrypted:', '')),
}));
vi.mock('electron', () => ({ safeStorage: {
  isEncryptionAvailable: () => state.encrypted,
  get getSelectedStorageBackend() { return state.hasBackendMethod ? () => state.backend : undefined; },
  encryptString: state.encrypt, decryptString: state.decrypt,
} }));
vi.mock('../store', () => ({ store: {
  get: () => state.auth,
  set: (_key: string, value: Record<string, unknown>) => { state.auth = structuredClone(value); },
} }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); state.encrypted = true; state.backend = 'dpapi'; state.hasBackendMethod = true;
  state.auth = { apiUrl: 'https://server.test', userId: 'alice', username: 'Alice' };
  state.decrypt.mockImplementation(value => value.toString().replace('encrypted:', ''));
});
it('saves only encrypted credentials while preserving account metadata', async () => {
  const vault = await import('../credentials'); vault.saveRefreshToken('test-refresh');
  expect(vault.persistentCredentialsAvailable()).toBe(true);
  expect(state.auth).toMatchObject({ apiUrl: 'https://server.test', userId: 'alice', username: 'Alice' });
  expect(state.auth.refreshToken).toBeUndefined();
  expect(state.auth.encryptedRefreshToken).toBe(Buffer.from('encrypted:test-refresh').toString('base64'));
  expect(state.encrypt).toHaveBeenCalledWith('test-refresh');
  expect(vault.readRefreshToken()).toBe('test-refresh'); expect(state.decrypt).not.toHaveBeenCalled();
});
it('restores encrypted credentials after the in-memory session is restarted', async () => {
  let vault = await import('../credentials'); vault.saveRefreshToken('test-refresh');
  vi.resetModules(); vault = await import('../credentials');
  expect(vault.readRefreshToken()).toBe('test-refresh');
  expect(state.decrypt).toHaveBeenCalledWith(Buffer.from('encrypted:test-refresh'));
});
it.each(['unavailable', 'basic_text'])('keeps credentials only in memory when the backend is %s', async backend => {
  state.encrypted = backend !== 'unavailable'; state.backend = backend;
  let vault = await import('../credentials'); vault.saveRefreshToken('test-refresh');
  expect(vault.persistentCredentialsAvailable()).toBe(false);
  expect(vault.readRefreshToken()).toBe('test-refresh');
  expect(state.auth.refreshToken).toBeUndefined(); expect(state.auth.encryptedRefreshToken).toBeUndefined();
  expect(state.encrypt).not.toHaveBeenCalled();
  vi.resetModules(); vault = await import('../credentials');
  expect(vault.readRefreshToken()).toBeUndefined();
});
it('does not try to decrypt stored ciphertext while secure storage is unavailable', async () => {
  state.auth.encryptedRefreshToken = 'encrypted'; state.encrypted = false;
  const vault = await import('../credentials'); expect(vault.readRefreshToken()).toBeUndefined();
  expect(state.decrypt).not.toHaveBeenCalled();
});
it('returns no credentials when decryption fails instead of crashing startup', async () => {
  state.auth.encryptedRefreshToken = Buffer.from('old-profile').toString('base64');
  state.decrypt.mockImplementation(() => { throw new Error('key unavailable'); });
  const vault = await import('../credentials'); expect(vault.readRefreshToken()).toBeUndefined();
});
it('migrates legacy plaintext credentials into encrypted storage on first read', async () => {
  state.auth.refreshToken = 'legacy-test-refresh';
  const vault = await import('../credentials'); expect(vault.readRefreshToken()).toBe('legacy-test-refresh');
  expect(state.auth.refreshToken).toBeUndefined(); expect(state.auth.encryptedRefreshToken).toBeTruthy();
});
it('removes legacy plaintext even if secure persistence is unavailable', async () => {
  state.auth.refreshToken = 'legacy-test-refresh'; state.backend = 'basic_text';
  const vault = await import('../credentials'); expect(vault.readRefreshToken()).toBe('legacy-test-refresh');
  expect(state.auth.refreshToken).toBeUndefined(); expect(state.auth.encryptedRefreshToken).toBeUndefined();
});
it('logout clears both credential forms and the in-memory token', async () => {
  const vault = await import('../credentials'); vault.saveRefreshToken('test-refresh');
  state.auth.refreshToken = 'old-copy'; vault.saveRefreshToken();
  expect(vault.readRefreshToken()).toBeUndefined();
  expect(state.auth.refreshToken).toBeUndefined(); expect(state.auth.encryptedRefreshToken).toBeUndefined();
  expect(state.auth.userId).toBe('alice');
});
it('supports secure backends that do not expose backend selection', async () => {
  state.hasBackendMethod = false;
  const vault = await import('../credentials'); expect(vault.persistentCredentialsAvailable()).toBe(true);
});
