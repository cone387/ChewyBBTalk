jest.mock('react-native', () => ({}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));
jest.mock('../../src/services/offlineCacheService', () => ({ initCacheDB: jest.fn(), getCachedBBTalks: jest.fn(), cacheBBTalks: jest.fn(), setLastSyncTime: jest.fn(), getLastSyncTime: jest.fn() }));
jest.mock('../../src/utils/errorHandler', () => ({ logError: jest.fn() }));
import { act, cleanup, renderHook } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import * as cache from '../../src/services/offlineCacheService';
import { logError } from '../../src/utils/errorHandler';
import { setSession, clearSession, getSession } from '../../src/services/session';
import { useOfflineCache } from '../../src/hooks/useOfflineCache';

beforeEach(() => {
  jest.clearAllMocks(); setSession('https://example.com', 'alice');
  [cache.initCacheDB, cache.getCachedBBTalks, cache.cacheBBTalks, cache.setLastSyncTime, cache.getLastSyncTime]
    .forEach(fn => (fn as jest.Mock).mockReset().mockResolvedValue(undefined));
  (cache.getLastSyncTime as jest.Mock).mockResolvedValue('last-sync');
  (cache.getCachedBBTalks as jest.Mock).mockResolvedValue([{ id: 'cached' }]);
});
afterEach(cleanup);

it('tracks network changes and unsubscribes when unmounted', () => {
  const { result, unmount } = renderHook(useOfflineCache);
  const listener = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0];
  act(() => listener({ isConnected: false })); expect(result.current.isOffline).toBe(true);
  act(() => listener({ isConnected: null })); expect(result.current.isOffline).toBe(false);
  unmount(); expect((NetInfo.addEventListener as jest.Mock).mock.results[0].value).toHaveBeenCalledTimes(1);
});

it('initializes and reads data using the captured account session', async () => {
  const session = getSession(); const { result } = renderHook(useOfflineCache);
  await act(async () => { await result.current.initCache(); });
  expect(result.current.lastSyncTime).toBe('last-sync');
  expect(cache.getLastSyncTime).toHaveBeenCalledWith(session);
  expect(await result.current.loadCachedData()).toEqual([{ id: 'cached' }]);
  expect(cache.getCachedBBTalks).toHaveBeenCalledWith(session);
});

it('updates the synchronization timestamp only after cache persistence succeeds', async () => {
  const { result } = renderHook(useOfflineCache);
  await act(async () => { await result.current.syncToCache([]); });
  expect(result.current.lastSyncTime).toEqual(expect.any(String));
  expect(cache.setLastSyncTime).toHaveBeenCalledWith(result.current.lastSyncTime, getSession());
  expect((cache.cacheBBTalks as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((cache.setLastSyncTime as jest.Mock).mock.invocationCallOrder[0]);
});

it('does not expose cached data or sync status after an account switch', async () => {
  const { result } = renderHook(useOfflineCache); clearSession();
  await act(async () => { await result.current.initCache(); await result.current.syncToCache([]); });
  expect(result.current.lastSyncTime).toBeNull();
  expect(await result.current.loadCachedData()).toEqual([]);
});

it.each(['init', 'read', 'write'])('handles %s cache failures without reporting success', async (operation) => {
  const { result } = renderHook(useOfflineCache);
  if (operation === 'init') {
    (cache.initCacheDB as jest.Mock).mockRejectedValueOnce(new Error('failed'));
    await act(async () => { await result.current.initCache(); });
  } else if (operation === 'read') {
    (cache.getCachedBBTalks as jest.Mock).mockRejectedValueOnce(new Error('failed'));
    expect(await result.current.loadCachedData()).toEqual([]);
  } else {
    (cache.cacheBBTalks as jest.Mock).mockRejectedValueOnce(new Error('failed'));
    await act(async () => { await result.current.syncToCache([]); });
    expect(cache.setLastSyncTime).not.toHaveBeenCalled();
  }
  expect(result.current.lastSyncTime).toBeNull();
  expect(logError).toHaveBeenCalledWith(expect.any(Error), expect.stringContaining('useOfflineCache'));
});
