const b64url = (obj: object) =>
  Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const makeToken = (payload: object) => `h.${b64url(payload)}.s`;
const okLogin = (access = 'tok-a', refresh = 'tok-r') => new Response(
  JSON.stringify({ access, refresh, user: { id: 1, username: 'alice' } }),
  { status: 200 },
);

interface SetupOpts {
  platform?: string;
  storage?: Record<string, string>;
  slowWrites?: string[];
  failReads?: boolean;
}

function setupAuth(opts: SetupOpts = {}) {
  const secureStore = new Map<string, string>(Object.entries(opts.storage ?? {}));
  const releaseWrites: Array<() => void> = [];
  const asyncStorage = {
    getItem: jest.fn(() => Promise.resolve(null as any)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  };
  const local: Record<string, string> = {};
  const secureMocks = {
    getItemAsync: jest.fn((key: string) =>
      opts.failReads ? Promise.reject(new Error('storage 已锁定')) : Promise.resolve(secureStore.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      if (opts.slowWrites?.includes(key)) {
        return new Promise<void>((resolve) => {
          releaseWrites.push(() => { secureStore.set(key, value); resolve(); });
        });
      }
      secureStore.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => { secureStore.delete(key); return Promise.resolve(); }),
  };
  jest.doMock('react-native', () => ({ Platform: { OS: opts.platform ?? 'ios' } }));
  jest.doMock('expo-secure-store', () => secureMocks);
  jest.doMock('@react-native-async-storage/async-storage', () => asyncStorage);
  jest.doMock('../../src/config', () => ({ getApiBaseUrl: () => 'https://example.test' }));
  (global as any).localStorage = {
    getItem: (k: string) => local[k] ?? null,
    setItem: (k: string, v: string) => { local[k] = String(v); },
    removeItem: (k: string) => { delete local[k]; },
  };
  global.fetch = jest.fn();
  const sessionSvc = require('../../src/services/session');
  const auth = require('../../src/services/auth');
  return {
    auth, session: sessionSvc, secureStore, secureMocks, asyncStorage, local, releaseWrites,
    fetchMock: global.fetch as jest.Mock,
  };
}

describe('auth flows', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => { jest.useRealTimers(); });

  it('logs in, persists credentials, opens the session and caches the token', async () => {
    const h = setupAuth();
    h.fetchMock.mockImplementation(async () => okLogin());
    expect(h.auth.getAccessTokenSync()).toBeNull();

    expect(await h.auth.login('alice', 'pw')).toEqual({ success: true });
    expect(h.fetchMock).toHaveBeenCalledWith('https://example.test/api/v1/bbtalk/auth/token/', expect.objectContaining({ method: 'POST' }));
    expect(h.secureStore.get('bbtalk_auth_server')).toBe('https://example.test');
    expect(h.secureStore.get('bbtalk_access_token')).toBe('tok-a');
    expect(h.secureStore.get('bbtalk_user_info')).toContain('alice');
    expect(h.asyncStorage.setItem).toHaveBeenCalledWith('privacy_locked', 'false');
    expect(h.auth.getAccessTokenSync()).toBe('tok-a');
    expect(h.auth.getCurrentUser()?.username).toBe('alice');
    expect(await h.auth.isAuthenticated()).toBe(true);
  });

  it('falls back to localStorage on the web platform', async () => {
    const h = setupAuth({ platform: 'web' });
    h.fetchMock.mockImplementation(async () => okLogin());
    expect(await h.auth.login('alice', 'pw')).toEqual({ success: true });
    expect(h.local.bbtalk_access_token).toBe('tok-a');
    expect(h.secureMocks.setItemAsync).not.toHaveBeenCalled();
    expect(await h.auth.getAccessToken()).toBe('tok-a');

    await h.auth.logout();
    expect(h.local.bbtalk_access_token).toBeUndefined();
    expect(await h.auth.isAuthenticated()).toBe(false);
  });

  it.each([
    ['err-json', async () => new Response(JSON.stringify({ error: '用户名或密码错误' }), { status: 400 }), '用户名或密码错误'],
    ['broken-json', async () => new Response('not-json', { status: 400 }), '登录失败'],
    ['abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; return Promise.reject(e); }, '连接超时，请检查服务地址是否正确'],
    ['network', () => Promise.reject(new Error('dns 失败')), '网络错误，请检查网络连接或服务地址'],
  ])('login reports %s failures', async (_name, fetchImpl, expected) => {
    const h = setupAuth();
    h.fetchMock.mockImplementation(fetchImpl as any);
    expect(await h.auth.login('alice', 'pw')).toEqual({ success: false, error: expected });
    expect(h.secureStore.has('bbtalk_access_token')).toBe(false);
  });

  it('rejects the login when the session changes while the request is in flight', async () => {
    const h = setupAuth();
    h.fetchMock.mockImplementation(async () => { h.session.clearSession(); return okLogin(); });
    expect(await h.auth.login('alice', 'pw')).toEqual({ success: false, error: '服务已切换，请重新登录' });
    expect(h.secureStore.has('bbtalk_access_token')).toBe(false);
  });

  it('aborts credential writes when the session changes mid-write', async () => {
    const h = setupAuth({ slowWrites: ['bbtalk_auth_server'] });
    h.fetchMock.mockImplementation(async () => okLogin());
    const pending = h.auth.login('alice', 'pw');
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    h.session.clearSession();
    h.releaseWrites.splice(0).forEach((release) => release());
    // The session-change error surfaces through login's generic network error.
    expect(await pending).toEqual({ success: false, error: '网络错误，请检查网络连接或服务地址' });
    expect(h.auth.getCurrentUser()).toBeNull();
  });

  it('registers a new account and stores the session', async () => {
    const h = setupAuth();
    h.fetchMock.mockImplementation(async () => okLogin('reg-a', 'reg-r'));
    expect(await h.auth.register({ username: 'new', password: 'pw', email: 'a@b.c' })).toEqual({ success: true });
    expect(h.fetchMock).toHaveBeenCalledWith('https://example.test/api/v1/bbtalk/auth/register/', expect.objectContaining({ method: 'POST' }));
    expect(h.secureStore.get('bbtalk_access_token')).toBe('reg-a');
    expect(h.auth.getCurrentUser()?.username).toBe('alice');
  });

  it.each([
    ['session-change', async () => { throw new Error('flip'); }, undefined],
    ['err-json', async () => new Response(JSON.stringify({ error: '用户名已存在' }), { status: 400 }), '用户名已存在'],
    ['broken-json', async () => new Response('nope', { status: 400 }), '注册失败'],
    ['abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; return Promise.reject(e); }, '连接超时，请检查服务地址是否正确'],
    ['network', () => Promise.reject(new Error('offline')), '网络错误，请检查网络连接或服务地址'],
  ])('register reports %s failures', async (name, fetchImpl, expected) => {
    const h = setupAuth();
    if (name === 'session-change') {
      h.fetchMock.mockImplementation(async () => { h.session.clearSession(); return okLogin(); });
      expect(await h.auth.register({ username: 'u', password: 'p' })).toEqual({ success: false, error: '服务已切换，请重新登录' });
      return;
    }
    h.fetchMock.mockImplementation(fetchImpl as any);
    expect(await h.auth.register({ username: 'u', password: 'p' })).toEqual({ success: false, error: expected });
  });
});

describe('auth token refresh edge cases', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => { jest.useRealTimers(); });

  it.each([401, 403])('clears login state when the refresh token is rejected with %i', async (status) => {
    const h = setupAuth({
      storage: { bbtalk_access_token: 'old-a', bbtalk_refresh_token: 'r1', bbtalk_user_info: '{"id":1}' },
    });
    h.fetchMock.mockImplementation(async () => new Response('{}', { status }));
    expect(await h.auth.refreshAccessToken()).toBe(false);
    expect(h.secureStore.has('bbtalk_access_token')).toBe(false);
    expect(h.secureStore.has('bbtalk_refresh_token')).toBe(false);
    expect(h.secureStore.has('bbtalk_user_info')).toBe(false);
    expect(await h.auth.isAuthenticated()).toBe(false);
  });

  it('keeps credentials and retries later on other server errors', async () => {
    jest.useFakeTimers();
    const h = setupAuth({ storage: { bbtalk_access_token: 'old-a', bbtalk_refresh_token: 'r1' } });
    h.fetchMock.mockImplementation(async () => new Response('oops', { status: 500 }));
    expect(await h.auth.refreshAccessToken()).toBe(false);
    expect(h.secureStore.get('bbtalk_access_token')).toBe('old-a');

    await jest.advanceTimersByTimeAsync(30_000);
    expect(h.fetchMock).toHaveBeenCalledTimes(2);
    expect(h.fetchMock.mock.calls[1]![0]).toBe('https://example.test/api/v1/bbtalk/auth/token/refresh/');
  });

  it('bails out when the session changes during the refresh request', async () => {
    const h = setupAuth({ storage: { bbtalk_access_token: 'old-a', bbtalk_refresh_token: 'r1' } });
    h.fetchMock.mockImplementation(async () => {
      h.session.clearSession();
      return new Response(JSON.stringify({ access: 'new-a' }), { status: 200 });
    });
    expect(await h.auth.refreshAccessToken()).toBe(false);
    expect(h.secureStore.get('bbtalk_access_token')).toBe('old-a');
  });

  it('bails out when the session changes while parsing the refresh response', async () => {
    const h = setupAuth({ storage: { bbtalk_access_token: 'old-a', bbtalk_refresh_token: 'r1' } });
    h.fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => { h.session.clearSession(); return { access: 'new-a' }; },
    }));
    expect(await h.auth.refreshAccessToken()).toBe(false);
    expect(h.secureStore.get('bbtalk_access_token')).toBe('old-a');
  });

  it('skips cache priming when the session changes mid-write', async () => {
    const h = setupAuth({
      storage: { bbtalk_access_token: 'old-a', bbtalk_refresh_token: 'r1' },
      slowWrites: ['bbtalk_access_token'],
    });
    h.fetchMock.mockImplementation(async () => new Response(JSON.stringify({ access: 'new-a' }), { status: 200 }));
    const pending = h.auth.refreshAccessToken();
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    h.session.clearSession();
    h.releaseWrites.splice(0).forEach((release) => release());
    expect(await pending).toBe(false);
    expect(h.secureStore.get('bbtalk_access_token')).toBe('new-a');
  });
});

describe('auth refresh scheduling', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => { jest.useRealTimers(); });

  it('schedules a proactive refresh before the token expires', async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const h = setupAuth();
    h.fetchMock.mockImplementation(async () => okLogin(token, 'r1'));
    await h.auth.login('alice', 'pw');
    expect(h.fetchMock).toHaveBeenCalledTimes(1);

    // Advance to the first scheduled refresh (5 min before expiry). Each
    // completed refresh reschedules 30s later, which stays beyond this window.
    await jest.advanceTimersByTimeAsync(3_300_000);
    expect(h.fetchMock).toHaveBeenCalledTimes(2);
    expect(h.fetchMock.mock.calls[1]![0]).toBe('https://example.test/api/v1/bbtalk/auth/token/refresh/');
    expect(JSON.parse(h.fetchMock.mock.calls[1]![1].body)).toEqual({ refresh: 'r1' });
  });

  it('keeps retrying in 30s intervals while the network is down', async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const h = setupAuth();
    h.fetchMock
      .mockImplementationOnce(async () => okLogin(token, 'r1'))
      .mockImplementation(() => Promise.reject(new Error('offline')));
    await h.auth.login('alice', 'pw');

    await jest.advanceTimersByTimeAsync(3_300_000);
    await jest.advanceTimersByTimeAsync(30_000);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(h.fetchMock).toHaveBeenCalledTimes(4);
    expect(h.secureStore.get('bbtalk_refresh_token')).toBe('r1');
  });

  it('does not schedule anything for tokens without an expiry', async () => {
    const h = setupAuth();
    h.fetchMock.mockImplementation(async () => okLogin(makeToken({}), 'r1'));
    await h.auth.login('alice', 'pw');
    await jest.advanceTimersByTimeAsync(10_000_000);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('auth logout and user cache', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('blacklists the refresh token on the server and clears local state', async () => {
    const h = setupAuth({ storage: { bbtalk_access_token: 'old-a', bbtalk_refresh_token: 'r1' } });
    h.fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }));
    await h.auth.logout();
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(h.fetchMock).toHaveBeenCalledWith(
      'https://example.test/api/v1/bbtalk/auth/token/blacklist/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer old-a' }),
        body: JSON.stringify({ refresh: 'r1' }),
      }),
    );
    expect(h.secureStore.has('bbtalk_access_token')).toBe(false);
  });

  it('refreshes the cached profile in the background during init', async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const h = setupAuth({ storage: { bbtalk_access_token: token } });
    h.fetchMock.mockImplementation(async () => new Response(
      JSON.stringify({ id: 7, username: 'fresh' }), { status: 200 },
    ));
    expect(await h.auth.initAuth()).toBe(true);
    expect(h.auth.getCurrentUser()?.username).toBe('fresh');
    expect(h.secureStore.get('bbtalk_user_info')).toContain('fresh');
    await h.auth.logout(); // clears the scheduled proactive refresh timer
  });

  it('clears login when a valid token has no profile available', async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const h = setupAuth({ storage: { bbtalk_access_token: token } });
    h.fetchMock.mockImplementation(async () => new Response('{}', { status: 500 }));
    expect(await h.auth.initAuth()).toBe(false);
    expect(h.secureStore.has('bbtalk_access_token')).toBe(false);
  });

  it('treats a failing profile fetch as offline and keeps the token', async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const h = setupAuth({ storage: { bbtalk_access_token: token, bbtalk_user_info: JSON.stringify({ id: 1, username: 'cached' }) } });
    h.fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    expect(await h.auth.initAuth()).toBe(true);
    expect(h.auth.getCurrentUser()?.username).toBe('cached');
    await h.auth.logout();
  });

  it('recovers a corrupted cached profile via a fresh fetch', async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const h = setupAuth({ storage: { bbtalk_access_token: token, bbtalk_user_info: '{corrupt' } });
    h.fetchMock.mockImplementation(async () => new Response(
      JSON.stringify({ id: 1, username: 'recovered' }), { status: 200 },
    ));
    expect(await h.auth.initAuth()).toBe(true);
    expect(h.auth.getCurrentUser()?.username).toBe('recovered');
    await h.auth.logout();
  });

  it('returns false when an expired token cannot refresh and the cache is corrupt', async () => {
    const h = setupAuth({
      storage: {
        bbtalk_access_token: makeToken({ exp: 1 }),
        bbtalk_refresh_token: 'r1',
        bbtalk_user_info: '{corrupt',
      },
    });
    h.fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    expect(await h.auth.initAuth()).toBe(false);
    expect(h.auth.getCurrentUser()).toBeNull();
    await h.auth.logout(); // cancels the 30s retry timer
  });

  it('returns false when credential storage itself fails', async () => {
    const h = setupAuth({ failReads: true });
    expect(await h.auth.initAuth()).toBe(false);
  });

  it('updates the cached user through the serialized write path', async () => {
    const h = setupAuth();
    h.fetchMock.mockImplementation(async () => okLogin());
    await h.auth.login('alice', 'pw');
    await h.auth.updateCachedUser({ id: 1, username: 'renamed' });
    expect(h.secureStore.get('bbtalk_user_info')).toContain('renamed');
    expect(h.auth.getCurrentUser()?.username).toBe('renamed');
  });

  it('ignores profile updates when no session is active', async () => {
    const h = setupAuth();
    await h.auth.updateCachedUser({ id: 9, username: 'ghost' });
    expect(h.secureMocks.setItemAsync).not.toHaveBeenCalled();
    expect(h.auth.getCurrentUser()).toBeNull();
    expect(await h.auth.isAuthenticated()).toBe(false);
  });
});

