import {
  initCacheDB,
  cacheBBTalks,
  getCachedBBTalks,
  clearCache,
  getLastSyncTime,
  setLastSyncTime,
} from '../../src/services/offlineCacheService.web';

describe('offlineCacheService web stubs', () => {
  it('no-ops every cache operation', async () => {
    await expect(initCacheDB()).resolves.toBeUndefined();
    await expect(cacheBBTalks([{ id: 'x' } as never])).resolves.toBeUndefined();
    await expect(getCachedBBTalks()).resolves.toEqual([]);
    await expect(clearCache()).resolves.toBeUndefined();
    await expect(getLastSyncTime()).resolves.toBeNull();
    await expect(setLastSyncTime('2026-10-08T00:00:00Z')).resolves.toBeUndefined();
  });

  it('ignores the session argument', async () => {
    const session = { token: 'abc' } as never;
    await expect(cacheBBTalks([], session)).resolves.toBeUndefined();
    await expect(getCachedBBTalks(session)).resolves.toEqual([]);
    await expect(clearCache(session)).resolves.toBeUndefined();
    await expect(getLastSyncTime(session)).resolves.toBeNull();
  });
});
