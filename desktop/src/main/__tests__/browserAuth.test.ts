import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { get } from 'node:http';
import { createHash } from 'node:crypto';
const state = vi.hoisted(() => ({ url: '', generation: 0, accepted: vi.fn() }));
vi.mock('electron', () => ({ shell: { openExternal: async (url: string) => { state.url = url; } } }));
vi.mock('../auth', () => ({
  normalizeServer: (url: string) => new URL(url).origin, getApiUrl: () => 'https://server.test',
  beginLogin: () => ++state.generation, getSessionGeneration: () => state.generation,
  acceptTokens: (...args: unknown[]) => state.accepted(...args),
}));
function callback(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    get(url, response => { response.resume(); response.on('end', () => resolve(response.statusCode!)); }).on('error', reject);
  });
}
beforeEach(() => { vi.resetModules(); state.url = ''; state.accepted.mockReset(); });
afterEach(async () => { (await import('../browserAuth')).cancelBrowserLogin(); vi.unstubAllGlobals(); });

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
