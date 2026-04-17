import { useState, useCallback, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import type { BBTalk } from '../types';
import {
  initCacheDB,
  getCachedBBTalks,
  cacheBBTalks,
  setLastSyncTime,
  getLastSyncTime,
} from '../services/offlineCacheService';
import { logError } from '../utils/errorHandler';

export interface UseOfflineCacheReturn {
  isOffline: boolean;
  lastSyncTime: string | null;
  initCache: () => Promise<void>;
  loadCachedData: () => Promise<BBTalk[]>;
  syncToCache: (bbtalks: BBTalk[]) => Promise<void>;
}

/**
 * 离线缓存 Hook
 * - 监听网络状态变化，维护 isOffline 状态
 * - 提供缓存初始化、读取、写入接口
 * - 维护 lastSyncTime 状态
 */
export function useOfflineCache(): UseOfflineCacheReturn {
  const [isOffline, setIsOffline] = useState(false);
  const [lastSyncTime, setLastSyncTimeState] = useState<string | null>(null);

  // 监听网络状态变化
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !(state.isConnected ?? true);
      setIsOffline(offline);
    });
    return () => unsubscribe();
  }, []);

  // 初始化缓存数据库
  const initCache = useCallback(async () => {
    try {
      await initCacheDB();
      const syncTime = await getLastSyncTime();
      setLastSyncTimeState(syncTime);
    } catch (e) {
      logError(e, 'useOfflineCache.initCache');
    }
  }, []);

  // 从 SQLite 读取缓存 BBTalk 列表
  const loadCachedData = useCallback(async (): Promise<BBTalk[]> => {
    try {
      return await getCachedBBTalks();
    } catch (e) {
      logError(e, 'useOfflineCache.loadCachedData');
      return [];
    }
  }, []);

  // 将最新数据写入缓存并更新 lastSyncTime
  const syncToCache = useCallback(async (bbtalks: BBTalk[]) => {
    try {
      await cacheBBTalks(bbtalks);
      const now = new Date().toISOString();
      await setLastSyncTime(now);
      setLastSyncTimeState(now);
    } catch (e) {
      logError(e, 'useOfflineCache.syncToCache');
    }
  }, []);

  return {
    isOffline,
    lastSyncTime,
    initCache,
    loadCachedData,
    syncToCache,
  };
}
