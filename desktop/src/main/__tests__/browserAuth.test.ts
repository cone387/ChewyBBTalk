import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer, request, type RequestOptions } from 'node:http';
import { createHash } from 'node:crypto';
const state = vi.hoisted(() => ({ url: '', generation: 0, accepted: vi.fn(), openError: null as Error | null }));
vi.mock('electron', () => ({ shell: { openExternal: async (url: string) => {
  state.url = url;
  if (state.openError) throw state.openError;
} } }));
vi.mock('node:http', async importOriginal => {
  const actual = await importOriginal<typeof import('node:http')>();
  return { ...actual, createServer: vi.fn(actual.createServer) };
});
vi.mock('../auth', () => ({
  normalizeServer: (url: string) => new URL(url).origin, getApiUrl: () => 'https://server.test',
  beginLogin: () => ++state.generation, getSessionGeneration: () => state.generation,
  acceptTokens: (...args: unknown[]) => state.accepted(...args),
}));
function callback(url: string, options: RequestOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    request(url, options, response => { response.resume(); response.on('end', () => resolve(response.statusCode!)); }).on('error', reject).end();
  });
}
beforeEach(() => { vi.resetModules(); state.url = ''; state.openError = null; state.accepted.mockReset(); });
afterEach(async () => {
  (await import('../browserAuth')).cancelBrowserLogin();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function startLogin() {
  const api = await import('../browserAuth');
  const pending = api.browserLogin();
  await vi.waitFor(() => expect(state.url).not.toBe(''));
  const authorization = new URL(state.url);
  const redirect = authorization.searchParams.get('redirect_uri')!;
  const query = new URLSearchParams({ state: authorization.searchParams.get('state')!, code: 'c'.repeat(43) });
  return { ...api, pending, redirect, callbackUrl: `${redirect}?${query}` };
}

it('opens a PKCE request, rejects foreign state and completes only the matching callback', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ access: 'access', refresh: 'refresh' }))));
  const { browserLogin } = await import('../browserAuth');
  const pending = browserLogin();
  await vi.waitFor(() => expect(state.url).not.toBe(''));
  const authorization = new URL(state.url);
  const redirect = authorization.searchParams.get('redirect_uri')!;
  expect(await callback(redirect + '?state=wrong&code=' + 'c'.repeat(43))).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
  const query = new URLSearchParams({ state: authorization.searchParams.get('state')!, code: 'c'.repeat(43) });
  expect(await callback(redirect + '?' + query)).toBe(200);
  expect(await pending).toEqual({ ok: true });
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(createHash('sha256').update(body.code_verifier).digest('base64url')).toBe(authorization.searchParams.get('code_challenge'));
  expect(body.redirect_uri).toBe(redirect);
  expect(state.accepted).toHaveBeenCalledOnce();
  await expect(callback(redirect + '?' + query)).rejects.toThrow();
});

it('cancellation releases the listener and does not create a session', async () => {
  const { browserLogin, cancelBrowserLogin } = await import('../browserAuth');
  const pending = browserLogin();
  await vi.waitFor(() => expect(state.url).not.toBe(''));
  const redirect = new URL(state.url).searchParams.get('redirect_uri')!;
  cancelBrowserLogin();
  expect((await pending).ok).toBe(false);
  expect(state.accepted).not.toHaveBeenCalled();
  await expect(callback(redirect)).rejects.toThrow();
});

it('a session switch while the browser is open prevents accepting credentials', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ access: 'access', refresh: 'refresh' }))));
  const { browserLogin } = await import('../browserAuth');
  const pending = browserLogin();
  await vi.waitFor(() => expect(state.url).not.toBe(''));
  const url = new URL(state.url);
  state.generation++;
  await callback(url.searchParams.get('redirect_uri')! + '?' + new URLSearchParams({ state: url.searchParams.get('state')!, code: 'c'.repeat(43) }));
  expect((await pending).ok).toBe(false);
  expect(state.accepted).not.toHaveBeenCalled();
});

it.each([
  { name: 'wrong method', options: { method: 'POST' }, change: (url: URL) => url },
  { name: 'wrong host', options: { headers: { Host: 'attacker.test' } }, change: (url: URL) => url },
  { name: 'wrong path', options: {}, change: (url: URL) => { url.pathname = '/other'; return url; } },
  { name: 'missing code', options: {}, change: (url: URL) => { url.searchParams.delete('code'); return url; } },
  { name: 'malformed code', options: {}, change: (url: URL) => { url.searchParams.set('code', 'invalid'); return url; } },
])('rejects $name without consuming the pending login', async ({ options, change }) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ access: 'a', refresh: 'r' }))));
  const { pending, redirect, callbackUrl } = await startLogin();
  expect(await callback(change(new URL(callbackUrl)).toString(), options)).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
  expect(state.accepted).not.toHaveBeenCalled();
  expect(await callback(callbackUrl)).toBe(200);
  expect(await pending).toEqual({ ok: true });
  expect(state.accepted).toHaveBeenCalledOnce();
  await expect(callback(redirect)).rejects.toThrow();
});

it('rejects a duplicate callback while exchanging and accepts tokens only once', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const { pending, callbackUrl } = await startLogin();
  const first = callback(callbackUrl);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(await callback(callbackUrl)).toBe(409);
  expect(fetch).toHaveBeenCalledOnce();
  expect(state.accepted).not.toHaveBeenCalled();
  finish(new Response(JSON.stringify({ access: 'a', refresh: 'r' })));
  expect(await first).toBe(200);
  expect(await pending).toEqual({ ok: true });
  expect(state.accepted).toHaveBeenCalledOnce();
  await expect(callback(callbackUrl)).rejects.toThrow();
});

it.each([
  { name: 'exchange rejection', response: () => Promise.resolve(new Response(JSON.stringify({ detail: 'expired code' }), { status: 400 })), error: 'expired code' },
  { name: 'invalid error response', response: () => Promise.resolve(new Response('not json', { status: 502 })), error: '授权失败，请重新发起登录' },
  { name: 'network failure', response: () => Promise.reject(new Error('offline')), error: 'offline' },
  { name: 'non-Error rejection', response: () => Promise.reject(null), error: '授权失败' },
])('releases the listener after $name without creating a session', async ({ response, error }) => {
  vi.stubGlobal('fetch', vi.fn(response));
  const { pending, callbackUrl } = await startLogin();
  await callback(callbackUrl);
  expect(await pending).toEqual({ ok: false, error });
  expect(state.accepted).not.toHaveBeenCalled();
  await expect(callback(callbackUrl)).rejects.toThrow();
});

it('honors browser denial without exchanging tokens and closes the listener', async () => {
  vi.stubGlobal('fetch', vi.fn());
  const { pending, callbackUrl } = await startLogin();
  const denied = new URL(callbackUrl);
  denied.searchParams.set('error', 'access_denied');
  expect(await callback(denied.toString())).toBe(200);
  expect(await pending).toEqual({ ok: false, error: '已取消浏览器登录' });
  expect(fetch).not.toHaveBeenCalled();
  expect(state.accepted).not.toHaveBeenCalled();
  await expect(callback(callbackUrl)).rejects.toThrow();
});

it('expires a pending authorization and closes the listener', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const { pending, callbackUrl } = await startLogin();
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect(await pending).toEqual({ ok: false, error: '等待授权超时，请重新登录' });
  expect(state.accepted).not.toHaveBeenCalled();
  await expect(callback(callbackUrl)).rejects.toThrow();
});

it('aborts a timed-out exchange and releases the listener', async () => {
  const timeout = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
  vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(options.signal!.reason), { once: true });
  })));
  const { pending, callbackUrl } = await startLogin();
  const receiving = callback(callbackUrl);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(AbortSignal.timeout).toHaveBeenCalledWith(20_000);
  timeout.abort(new Error('exchange timed out'));
  await receiving;
  expect(await pending).toEqual({ ok: false, error: 'exchange timed out' });
  expect(state.accepted).not.toHaveBeenCalled();
  await expect(callback(callbackUrl)).rejects.toThrow();
});

it('ignores exchange results arriving after cancellation', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const { pending, callbackUrl, cancelBrowserLogin } = await startLogin();
  // Install the rejection handler before cancelling the live socket.
  const receiving = callback(callbackUrl).catch(error => error);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
  cancelBrowserLogin();
  expect((await pending).ok).toBe(false);
  expect(signal.aborted).toBe(true);
  finish(new Response(JSON.stringify({ access: 'late', refresh: 'late' })));
  await receiving;
  await new Promise(resolve => setImmediate(resolve));
  expect(state.accepted).not.toHaveBeenCalled();
  await expect(callback(callbackUrl)).rejects.toThrow();
});

it('replaces an older authorization and closes its callback listener', async () => {
  const first = await startLogin();
  state.url = '';
  const second = await startLogin();
  expect(await first.pending).toEqual({ ok: false, error: '已取消浏览器登录' });
  await expect(callback(first.callbackUrl)).rejects.toThrow();
  second.cancelBrowserLogin();
  expect((await second.pending).ok).toBe(false);
  expect(state.accepted).not.toHaveBeenCalled();
});

it('reports failure to open the browser and closes the callback listener', async () => {
  state.openError = new Error('no browser');
  const { pending, callbackUrl } = await startLogin();
  expect(await pending).toEqual({ ok: false, error: '无法打开浏览器，请检查默认浏览器设置' });
  expect(state.accepted).not.toHaveBeenCalled();
  await expect(callback(callbackUrl)).rejects.toThrow();
});

it('reports listener errors without starting a browser or accepting credentials', async () => {
  const server = createServer();
  vi.spyOn(server, 'listen').mockImplementation(() => {
    queueMicrotask(() => server.emit('error', new Error('listen failed')));
    return server;
  });
  const close = vi.spyOn(server, 'close');
  const closeAll = vi.spyOn(server, 'closeAllConnections');
  vi.mocked(createServer).mockReturnValueOnce(server);
  const { browserLogin } = await import('../browserAuth');
  expect(await browserLogin()).toEqual({ ok: false, error: '无法建立本地授权回调，请重试' });
  expect(close).toHaveBeenCalledOnce();
  expect(closeAll).toHaveBeenCalledOnce();
  expect(state.url).toBe('');
  expect(state.accepted).not.toHaveBeenCalled();
});

it('rejects an invalid server URL before creating a listener', async () => {
  vi.mocked(createServer).mockClear();
  const { browserLogin } = await import('../browserAuth');
  expect(await browserLogin('invalid')).toEqual({ ok: false, error: '服务器地址无效' });
  expect(createServer).not.toHaveBeenCalled();
  expect(state.accepted).not.toHaveBeenCalled();
});
