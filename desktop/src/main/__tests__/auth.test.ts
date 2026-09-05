import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    vi.resetModules();
    vi.restoreAllMocks();
    storeState.auth = { apiUrl: 'https://example.test', username: '', refreshToken: 'refresh-token' };
  });

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
