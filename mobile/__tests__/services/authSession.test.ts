describe('authentication session boundaries', () => {
  let credentials: Map<string, string>;
  let server: string;
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    server = 'https://a.test';
    credentials = new Map([
      ['bbtalk_access_token', 'header.eyJzdWIiOiIxIn0.signature'],
      ['bbtalk_refresh_token', 'old-refresh'],
      ['bbtalk_user_info', JSON.stringify({ id: 1, username: 'alice' })],
      ['bbtalk_auth_server', server],
    ]);
    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
    jest.doMock('expo-secure-store', () => ({
      getItemAsync: async (key: string) => credentials.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => { credentials.set(key, value); },
      deleteItemAsync: async (key: string) => { credentials.delete(key); },
    }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({ setItem: jest.fn() }));
    jest.doMock('../../src/config', () => ({ getApiBaseUrl: () => server }));
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('completes local logout while blacklist is offline and rejects an earlier refresh response', async () => {
    let resolveRefresh!: (response: Response) => void;
    global.fetch = jest.fn((url: string) => url.includes('/refresh/')
      ? new Promise<Response>(resolve => { resolveRefresh = resolve; })
      : new Promise<Response>(() => {})) as any;
    const { setSession, getSession } = require('../../src/services/session');
    const { refreshAccessToken, logout } = require('../../src/services/auth');
    setSession(server, 1);
    const pending = refreshAccessToken();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(resolveRefresh).toBeDefined();
    await logout();
    expect(getSession().scope).toBeNull();
    expect(credentials.has('bbtalk_access_token')).toBe(false);
    resolveRefresh(new Response(JSON.stringify({ access: 'stale-token' }), { status: 200 }));
    expect(await pending).toBe(false);
    expect(credentials.has('bbtalk_access_token')).toBe(false);
  });

  it('does not send persisted credentials to a different server', async () => {
    global.fetch = jest.fn();
    const { getAccessToken, refreshAccessToken, initAuth } = require('../../src/services/auth');
    server = 'https://b.test';
    expect(await getAccessToken()).toBeNull();
    expect(await refreshAccessToken()).toBe(false);
    expect(await initAuth()).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
