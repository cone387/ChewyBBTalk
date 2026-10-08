import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { imageCacheService as ImageCacheServiceType } from '../src/services/cache/imageCache';

const boundary = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('../src/services/api/apiClient', () => ({
  apiClient: { download: boundary.download },
  ApiError: class ApiError extends Error {},
}));

type Service = typeof ImageCacheServiceType;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function cache(): Promise<Service> {
  const mod = await import('../src/services/cache/imageCache');
  return mod.imageCacheService as Service;
}
function imageBlob(size = 100) {
  return new Blob([new Uint8Array(size)], { type: 'image/png' });
}
function okResponse(blob: Blob) {
  return { ok: true, status: 200, blob: async () => blob };
}

describe('cache storage', () => {
  it('round-trips a blob, reports size and statistics', async () => {
    const service = await cache();
    const blob = imageBlob(2048);
    await service.set('/a.png', blob);
    expect(await service.get('/a.png')).not.toBeNull();
    expect(await service.getCacheSize()).toBe(2048);
    const stats = await service.getStats();
    expect(stats).toMatchObject({ count: 1, totalSize: 2048 });
    expect(stats.oldestTimestamp).toBe(stats.newestTimestamp);
  });

  it('returns empty statistics for a fresh database and honours deletes', async () => {
    const service = await cache();
    expect(await service.getStats()).toEqual({ count: 0, totalSize: 0, oldestTimestamp: 0, newestTimestamp: 0 });
    await service.set('/a.png', imageBlob(10));
    await service.delete('/a.png');
    expect(await service.get('/a.png')).toBeNull();
    expect(await service.getCacheSize()).toBe(0);
  });

  it('clears everything at once', async () => {
    const service = await cache();
    await service.set('/a.png', imageBlob(10));
    await service.set('/b.png', imageBlob(20));
    await service.clear();
    expect(await service.getCacheSize()).toBe(0);
  });

  it('drops entries older than the expiry window', async () => {
    const service = await cache();
    await service.set('/old.png', imageBlob(10));
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 24 * 3600 * 1000 + 1);
    expect(await service.get('/old.png')).toBeNull();
    expect(await service.getCacheSize()).toBe(0);
    clock.mockRestore();
  });

  it('clearExpired sweeps stale rows but keeps current ones', async () => {
    const service = await cache();
    await service.set('/a.png', imageBlob(10));
    await service.set('/b.png', imageBlob(10));
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 24 * 3600 * 1000 + 1000);
    await service.clearExpired();
    expect(await service.getCacheSize()).toBe(0);
    await service.set('/fresh.png', imageBlob(10)); // stamped at the mocked "now"
    await service.clearExpired();
    expect(await service.getCacheSize()).toBe(10);
    expect(await service.get('/fresh.png')).not.toBeNull();
    clock.mockRestore();
  });

  it('evicts the oldest entries when the budget would be exceeded', async () => {
    const service = await cache();
    (service as unknown as { MAX_CACHE_SIZE: number }).MAX_CACHE_SIZE = 1000;
    await service.set('/first.png', imageBlob(600));
    await service.set('/second.png', imageBlob(600));
    expect(await service.get('/first.png')).toBeNull();
    expect(await service.get('/second.png')).not.toBeNull();
    expect(await service.getCacheSize()).toBe(600);
  });
});

describe('downloading', () => {
  it('fetches on a miss, then serves subsequent reads from the cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(imageBlob(50)));
    vi.stubGlobal('fetch', fetchMock);
    const service = await cache();
    const first = await service.getOrFetch('/media/x.png');
    expect(first).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/media/x.png', expect.objectContaining({
      mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'default',
    }));
    const second = await service.getOrFetch('/media/x.png');
    expect(second).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await service.getCacheSize()).toBe(50);
  });

  it('does not cache non-image payloads but still returns them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(new Blob(['{"json":1}'], { type: 'application/json' })));
    vi.stubGlobal('fetch', fetchMock);
    const service = await cache();
    expect(await service.getOrFetch('/media/data.json')).not.toBeNull();
    await service.getOrFetch('/media/data.json');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await service.getCacheSize()).toBe(0);
  });

  it('refreshing skips the cache and reloads the resource', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(imageBlob(30)))
      .mockResolvedValueOnce(okResponse(imageBlob(70)));
    vi.stubGlobal('fetch', fetchMock);
    const service = await cache();
    await service.getOrFetch('/media/y.png');
    expect(await service.getCacheSize()).toBe(30);
    const fresh = await service.getOrFetch('/media/y.png', true);
    expect(fresh?.size).toBe(70);
    expect(fetchMock).toHaveBeenLastCalledWith('/media/y.png', expect.objectContaining({ cache: 'reload' }));
    expect(await service.getCacheSize()).toBe(70);
  });

  it('returns null after transport and HTTP failures', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, blob: async () => new Blob() })
      .mockRejectedValueOnce(new TypeError('fetch failed')));
    const service = await cache();
    expect(await service.getOrFetch('/missing.png')).toBeNull();
    expect(await service.getOrFetch('/unreachable.png')).toBeNull();
    expect(await service.getCacheSize()).toBe(0);
  });

  it('rewrites the URL scheme when a media protocol is configured', async () => {
    vi.stubEnv('VITE_MEDIA_URL_PROTOCOL', 'https');
    const fetchMock = vi.fn().mockResolvedValue(okResponse(imageBlob(10)));
    vi.stubGlobal('fetch', fetchMock);
    const service = await cache();
    await service.getOrFetch('http://cdn.example.com/i.png');
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/i.png', expect.anything());
  });
});

describe('private attachment routing', () => {
  it('delegates same-origin attachment URLs to the API client instead of the disk cache', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const blob = imageBlob(25);
    boundary.download.mockResolvedValue(blob);
    const service = await cache();
    const result = await service.getOrFetch('/api/v1/attachments/9?token=abc');
    expect(result).toBe(blob);
    expect(boundary.download).toHaveBeenCalledWith('/api/v1/attachments/9?token=abc');
    expect(fetchMock).not.toHaveBeenCalled();
    // Nothing from the private path should have been persisted.
    expect(await service.getCacheSize()).toBe(0);
  });

  it('keeps remote attachment-like paths on the public download path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(imageBlob(10)));
    vi.stubGlobal('fetch', fetchMock);
    const service = await cache();
    await service.getOrFetch('https://cdn.example.com/api/v1/attachments/9');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(boundary.download).not.toHaveBeenCalled();
  });
});
