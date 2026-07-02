describe('auth init', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('restores cached login without waiting for current-user network refresh', async () => {
    const secureStore = new Map<string, string>();
    secureStore.set('bbtalk_access_token', 'header.eyJzdWIiOiIxIn0.signature');
    secureStore.set('bbtalk_user_info', JSON.stringify({ id: 'u1', username: 'alice' }));

    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
    jest.doMock('expo-secure-store', () => ({
      getItemAsync: jest.fn((key: string) => Promise.resolve(secureStore.get(key) ?? null)),
      setItemAsync: jest.fn((key: string, value: string) => {
        secureStore.set(key, value);
        return Promise.resolve();
      }),
      deleteItemAsync: jest.fn((key: string) => {
        secureStore.delete(key);
        return Promise.resolve();
      }),
    }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      getItem: jest.fn(() => Promise.resolve(null)),
      setItem: jest.fn(() => Promise.resolve()),
      removeItem: jest.fn(() => Promise.resolve()),
    }));
    jest.doMock('../../src/config', () => ({ getApiBaseUrl: () => 'https://example.test' }));

    global.fetch = jest.fn(() => new Promise(() => {})) as any;

    const { initAuth, getCurrentUser } = require('../../src/services/auth');

    const result = await Promise.race([
      initAuth(),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 25)),
    ]);

    expect(result).toBe(true);
    expect(getCurrentUser()?.username).toBe('alice');
    await Promise.resolve();
    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.test/api/v1/bbtalk/user/me/',
      expect.any(Object),
    );
  });
});
