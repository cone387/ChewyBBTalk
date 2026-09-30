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
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const { getAccessToken, refreshAccessToken, initAuth } = require('../../src/services/auth');
    server = 'https://b.test';
    expect(await getAccessToken()).toBeNull();
    expect(await refreshAccessToken()).toBe(false);
    expect(await initAuth()).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(['account', 'server'])('does not clear newer credentials when %s changes during logout reads', async boundary => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    jest.doMock('expo-secure-store', () => ({
      getItemAsync: async (key: string) => { await gate; return credentials.get(key) ?? null; },
      setItemAsync: async (key: string, value: string) => { credentials.set(key, value); },
      deleteItemAsync: async (key: string) => { credentials.delete(key); },
    }));
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const { setSession, getSession } = require('../../src/services/session');
    const { logout } = require('../../src/services/auth');
    setSession(server, 1);
    const pending = logout();
    if (boundary === 'server') server = 'https://b.test';
    setSession(server, 2);
    credentials.set('bbtalk_access_token', 'bob-access');
    credentials.set('bbtalk_refresh_token', 'bob-refresh');
    credentials.set('bbtalk_auth_server', server);
    release(); await pending;
    expect(getSession().scope).toBe(JSON.stringify([server, '2']));
    expect(credentials.get('bbtalk_access_token')).toBe('bob-access');
    expect(credentials.get('bbtalk_refresh_token')).toBe('bob-refresh');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not let a slow profile cache write overwrite a later login', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let started = false;
    jest.doMock('expo-secure-store', () => ({
      getItemAsync: async (key: string) => credentials.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => {
        if (key === 'bbtalk_user_info' && value.includes('Edited Alice')) { started = true; await gate; }
        credentials.set(key, value);
      },
      deleteItemAsync: async (key: string) => { credentials.delete(key); },
    }));
    const bob = { id: 2, username: 'bob' };
    global.fetch = jest.fn().mockImplementation(async (url: string) => new Response(
      url.includes('/blacklist/') ? '{}' : JSON.stringify({ access: 'bob-access', refresh: 'bob-refresh', user: bob }), { status: 200 }));
    const auth = require('../../src/services/auth');
    expect(await auth.initAuth()).toBe(true);
    const save = auth.updateCachedUser({ id: 1, username: 'alice', display_name: 'Edited Alice' });
    for (let i = 0; i < 8; i++) await Promise.resolve(); expect(started).toBe(true);
    const signout = auth.logout();
    for (let i = 0; i < 16; i++) await Promise.resolve();
    const signin = auth.login('bob', 'password');
    for (let i = 0; i < 16; i++) await Promise.resolve(); release();
    await save; await signout; expect(await signin).toEqual({ success: true });
    expect(JSON.parse(credentials.get('bbtalk_user_info')!)).toEqual(bob);
    expect(auth.getCurrentUser()).toEqual(bob); expect(credentials.get('bbtalk_access_token')).toBe('bob-access');
  });
});
