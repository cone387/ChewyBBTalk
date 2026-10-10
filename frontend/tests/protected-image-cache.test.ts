import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  download: vi.fn(), scope: 'user-1/session-1', listeners: new Set<() => void>(),
}));
vi.mock('../src/services/api/apiClient', () => ({ apiClient: { download: boundary.download } }));
vi.mock('../src/services/authSessionScope', () => ({
  getAuthSessionScope: () => boundary.scope,
  subscribeAuthSession: (listener: () => void) => {
    boundary.listeners.add(listener);
    return () => boundary.listeners.delete(listener);
  },
}));

const url = '/api/v1/attachments/9/preview';
const blob = (size = 10) => new Blob([new Uint8Array(size)], { type: 'image/png' });
async function cache() { return (await import('../src/services/cache/imageCache')).imageCacheService; }
function switchSession(scope: string) {
  boundary.scope = scope;
  boundary.listeners.forEach(listener => listener());
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  boundary.download.mockReset().mockImplementation(async () => blob());
  boundary.scope = 'user-1/session-1';
  boundary.listeners.clear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('protected image request reuse', () => {
  it('shares concurrent downloads and reuses their blob after a consumer remounts', async () => {
    const service = await cache();
    const [first, second] = await Promise.all([service.getOrFetch(url), service.getOrFetch(url)]);
    expect(first).toBe(second);
    expect(await service.getOrFetch(url)).toBe(first);
    expect(boundary.download).toHaveBeenCalledTimes(1);
    expect(await service.getCacheSize()).toBe(0);
  });

  it('explicit retry bypasses cached data and requests an HTTP reload', async () => {
    const service = await cache();
    const old = await service.getOrFetch(url);
    const fresh = await service.getOrFetch(url, true);
    expect(fresh).not.toBe(old);
    expect(boundary.download).toHaveBeenCalledTimes(2);
    expect(boundary.download).toHaveBeenLastCalledWith(url, { cache: 'reload' });
    expect(await service.getOrFetch(url)).toBe(fresh);
  });

  it.each(['user-2/session-2', 'user-1/session-2', 'anonymous'])('never reuses across %s', async scope => {
    const service = await cache();
    const old = await service.getOrFetch(url);
    switchSession(scope);
    expect(await service.getOrFetch(url)).not.toBe(old);
    expect(boundary.download).toHaveBeenCalledTimes(2);
  });

  it('separates API servers even for identical paths', async () => {
    const service = await cache();
    await service.getOrFetch(url);
    vi.stubEnv('VITE_API_BASE_URL', 'https://other.example');
    await service.getOrFetch(`https://other.example${url}`);
    expect(boundary.download).toHaveBeenCalledTimes(2);
  });

  it('expires blobs after one minute without extending TTL on reads', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const service = await cache();
    const first = await service.getOrFetch(url);
    clock.mockReturnValue(60_999);
    expect(await service.getOrFetch(url)).toBe(first);
    clock.mockReturnValue(61_000);
    expect(await service.getOrFetch(url)).not.toBe(first);
    expect(boundary.download).toHaveBeenCalledTimes(2);
  });

  it('limits total blob bytes and evicts the least recently used image', async () => {
    boundary.download.mockImplementation(async () => blob(12 * 1024 * 1024));
    const service = await cache();
    const first = await service.getOrFetch(`${url}?n=1`);
    await service.getOrFetch(`${url}?n=2`);
    expect(await service.getOrFetch(`${url}?n=1`)).toBe(first);
    await service.getOrFetch(`${url}?n=3`);
    expect(await service.getOrFetch(`${url}?n=1`)).toBe(first);
    await service.getOrFetch(`${url}?n=2`);
    expect(boundary.download).toHaveBeenCalledTimes(4);
  });

  it('does not retain an oversized image or non-image payload', async () => {
    boundary.download.mockResolvedValueOnce(blob(33 * 1024 * 1024))
      .mockResolvedValueOnce(new Blob(['error'], { type: 'text/plain' }));
    const service = await cache();
    await service.getOrFetch(url);
    await service.getOrFetch(url);
    await service.getOrFetch(url);
    expect(boundary.download).toHaveBeenCalledTimes(3);
  });

  it('bounds the number of tiny blobs', async () => {
    const service = await cache();
    for (let n = 0; n < 129; n++) await service.getOrFetch(`${url}?n=${n}`);
    await service.getOrFetch(`${url}?n=0`);
    expect(boundary.download).toHaveBeenCalledTimes(130);
  });

  it.each(['session', 'permission', 'retry'])('rejects stale pending responses after %s changes', async reason => {
    let finish!: (value: Blob) => void;
    boundary.download.mockImplementationOnce(() => new Promise<Blob>(resolve => { finish = resolve; }));
    const service = await cache();
    const pending = service.getOrFetch(url);
    const rejected = expect(pending).rejects.toThrow();
    if (reason === 'session') switchSession('user-1/session-2');
    if (reason === 'permission') service.invalidateProtected();
    const fresh = await service.getOrFetch(url, reason === 'retry');
    finish(blob());
    await rejected;
    expect(await service.getOrFetch(url)).toBe(fresh);
    expect(boundary.download).toHaveBeenCalledTimes(2);
  });

  it('does not retain failures and invalidates existing permission-bound blobs', async () => {
    const service = await cache();
    const old = await service.getOrFetch(url);
    boundary.download.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { status: 403 }));
    await expect(service.getOrFetch(`${url}?other=1`)).rejects.toThrow('Forbidden');
    expect(await service.getOrFetch(url)).not.toBe(old);
    await service.getOrFetch(`${url}?other=1`);
    expect(boundary.download).toHaveBeenCalledTimes(4);
  });
});
