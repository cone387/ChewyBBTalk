/**
 * 离线缓存服务 - Web 端空实现
 * expo-sqlite 在 Web 端不可用（需要 SharedArrayBuffer + COOP/COEP），
 * 所以 Web 端跳过所有离线缓存操作。
 */
import type { BBTalk } from '../types';

export async function initCacheDB(): Promise<void> {}
export async function cacheBBTalks(_bbtalks: BBTalk[]): Promise<void> {}
export async function getCachedBBTalks(): Promise<BBTalk[]> { return []; }
export async function clearCache(): Promise<void> {}
export async function getLastSyncTime(): Promise<string | null> { return null; }
export async function setLastSyncTime(_timestamp: string): Promise<void> {}
