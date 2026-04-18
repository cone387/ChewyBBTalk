/**
 * 离线缓存服务模块（原生端）
 * 使用 expo-sqlite 实现 BBTalk 数据本地持久化
 * - 初始化 SQLite 数据库和表结构
 * - 全量替换写入 BBTalk 缓存
 * - 读取缓存并反序列化（损坏数据跳过）
 * - 清除缓存
 * - 读写最后同步时间戳
 *
 * Web 端使用 offlineCacheService.web.ts 的空实现（Metro 自动解析）
 */
import * as SQLite from 'expo-sqlite';
import type { BBTalk } from '../types';
import { logError } from '../utils/errorHandler';

const DB_NAME = 'bbtalk_cache.db';

let db: SQLite.SQLiteDatabase | null = null;

/**
 * 获取数据库实例（懒初始化）
 */
function getDB(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
  }
  return db;
}

/**
 * 初始化 SQLite 数据库和表结构
 * 创建 bbtalks 表和 meta 表（如果不存在）
 */
export async function initCacheDB(): Promise<void> {
  try {
    const database = getDB();
    database.execSync(
      `CREATE TABLE IF NOT EXISTS bbtalks (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );`
    );
    database.execSync(
      `CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );`
    );
  } catch (e) {
    logError(e, 'initCacheDB');
    throw e;
  }
}

/**
 * 将 BBTalk 列表写入缓存（全量替换）
 * 使用事务批量写入，先清空再插入
 */
export async function cacheBBTalks(bbtalks: BBTalk[]): Promise<void> {
  try {
    const database = getDB();
    const now = new Date().toISOString();

    database.withTransactionSync(() => {
      database.runSync('DELETE FROM bbtalks');
      for (const item of bbtalks) {
        database.runSync(
          'INSERT INTO bbtalks (id, data, synced_at) VALUES (?, ?, ?)',
          [item.id, JSON.stringify(item), now]
        );
      }
    });
  } catch (e) {
    logError(e, 'cacheBBTalks');
    throw e;
  }
}

/**
 * 从缓存读取 BBTalk 列表
 * 损坏数据跳过并 logError
 */
export async function getCachedBBTalks(): Promise<BBTalk[]> {
  try {
    const database = getDB();
    const rows = database.getAllSync<{ id: string; data: string; synced_at: string }>(
      'SELECT id, data, synced_at FROM bbtalks ORDER BY synced_at DESC'
    );

    const results: BBTalk[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data) as BBTalk;
        results.push(parsed);
      } catch (e) {
        logError(e, `parse cached bbtalk id=${row.id}`);
        // 损坏数据跳过
      }
    }
    return results;
  } catch (e) {
    logError(e, 'getCachedBBTalks');
    return [];
  }
}

/**
 * 清除所有缓存数据（bbtalks 表和 meta 表）
 */
export async function clearCache(): Promise<void> {
  try {
    const database = getDB();
    database.withTransactionSync(() => {
      database.runSync('DELETE FROM bbtalks');
      database.runSync('DELETE FROM meta');
    });
  } catch (e) {
    logError(e, 'clearCache');
    throw e;
  }
}

/**
 * 获取最后同步时间戳
 * 从 meta 表中读取 last_sync_time
 */
export async function getLastSyncTime(): Promise<string | null> {
  try {
    const database = getDB();
    const row = database.getFirstSync<{ value: string }>(
      'SELECT value FROM meta WHERE key = ?',
      ['last_sync_time']
    );
    return row?.value ?? null;
  } catch (e) {
    logError(e, 'getLastSyncTime');
    return null;
  }
}

/**
 * 更新最后同步时间戳
 * 写入 meta 表中的 last_sync_time
 */
export async function setLastSyncTime(timestamp: string): Promise<void> {
  try {
    const database = getDB();
    database.runSync(
      'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      ['last_sync_time', timestamp]
    );
  } catch (e) {
    logError(e, 'setLastSyncTime');
    throw e;
  }
}
