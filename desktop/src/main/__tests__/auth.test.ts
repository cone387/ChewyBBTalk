import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ safeStorage: {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
  decryptString: (value: Buffer) => value.toString().replace('encrypted:', ''),
} }));

const storeState: Record<string, unknown> = {
  'auth.apiUrl': 'https://example.test',
  auth: { apiUrl: 'https://example.test', username: '', refreshToken: 'refresh-token' },
};

vi.mock('../store', () => ({
  store: {
    get: vi.fn((key: string) => storeState[key]),
    set: vi.fn((key: string, value: unknown) => { storeState[key] = value; }),
  },
}));

function token(exp = Math.floor(Date.now() / 1000) + 3600) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `header.${payload}.signature`;
}

describe('desktop auth refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.restoreAllMocks();
    storeState.auth = { apiUrl: 'https://example.test', username: '', refreshToken: 'refresh-token' };
  });

  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('keeps the current access token when refresh fails due to a network error', async () => {
    const access = token();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access, refresh: 'refresh-token' }), { status: 200 }))
      .mockRejectedValueOnce(new Error('network down')));

    const auth = await import('../auth');
    await auth.login('alice', 'password');
    const refreshed = await auth.refreshAccessToken();

    expect(refreshed).toBe(false);
    expect(auth.getAccessToken()).toBe(access);
  });

  it('shares one refresh request for concurrent refresh callers', async () => {
    const access = token();
    let resolveRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => { resolveRefresh = resolve; });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access, refresh: 'refresh-token' }), { status: 200 }))
      .mockReturnValueOnce(refreshResponse));

    const auth = await import('../auth');
    await auth.login('alice', 'password');
    const first = auth.refreshAccessToken();
    const second = auth.refreshAccessToken();
    resolveRefresh?.(new Response(JSON.stringify({ access: token(), refresh: 'rotated-refresh' }), { status: 200 }));

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });
});

it('does not restore a logged-out session from a delayed refresh response', async () => {
  vi.resetModules();
  storeState.auth = { apiUrl: 'https://example.test', refreshToken: 'refresh-token' };
  let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const auth = await import('../auth');
  const pending = auth.refreshAccessToken();
  auth.logout();
  finish(new Response(JSON.stringify({ access: token(), refresh: 'late-token' })));
  expect(await pending).toBe(false);
  expect(auth.getAccessToken()).toBeNull();
  expect((storeState.auth as any).refreshToken).toBeUndefined();
  vi.unstubAllGlobals();
});

it('a delayed login cannot override a newer login or persist its server', async () => {
  vi.resetModules();
  vi.useFakeTimers();
  let finish!: (value: Response) => void;
  const newer = token();
  vi.stubGlobal('fetch', vi.fn()
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ access: newer, refresh: 'newer' }))));
  const auth = await import('../auth');
  const old = auth.login('old', 'password', 'https://old.test');
  expect((await auth.login('new', 'password', 'https://new.test')).ok).toBe(true);
  finish(new Response(JSON.stringify({ access: 'old-token', refresh: 'old-refresh' })));
  expect((await old).ok).toBe(false);
  expect(auth.getAccessToken()).toBe(newer);
  expect(storeState['auth.apiUrl']).toBe('https://new.test');
  auth.logout();
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});

it('never returns an expired access token after an offline refresh and keeps encrypted credentials', async () => {
  vi.resetModules(); vi.useFakeTimers();
  storeState.auth = { apiUrl: 'https://example.test', username: '' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access: token(), refresh: 'secret' }))).mockRejectedValue(new Error('offline')));
  const auth = await import('../auth');
  expect((await auth.login('alice', 'password')).ok).toBe(true);
  expect((storeState.auth as any).refreshToken).toBeUndefined();
  expect((storeState.auth as any).encryptedRefreshToken).toBeTruthy();
  vi.setSystemTime(Date.now() + 2 * 3600_000);
  expect(await auth.getValidAccessToken()).toBeNull();
  expect(auth.getAuthState().status).toBe('offline');
  expect((storeState.auth as any).encryptedRefreshToken).toBeTruthy();
  auth.logout(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});

it('refreshes once on a 401 and replays the request with the new token', async () => {
  vi.resetModules(); vi.useFakeTimers();
  storeState.auth = { apiUrl: 'https://example.test', username: '' };
  const fresh = token(Math.floor(Date.now() / 1000) + 7200);
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ access: token(), refresh: 'secret' })))
    .mockResolvedValueOnce(new Response('{}', { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ access: fresh, refresh: 'rotated' })))
    .mockResolvedValueOnce(new Response('{}')));
  const auth = await import('../auth');
  await auth.login('alice', 'password');
  expect((await auth.authenticatedFetch('/api/v1/bbtalk/')).status).toBe(200);
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
  expect((vi.mocked(fetch).mock.calls[3][1]?.headers as any).Authorization).toBe(`Bearer ${fresh}`);
  auth.logout(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});
