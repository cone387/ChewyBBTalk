/** Native read cache, isolated by server + account. Never adopts legacy rows. */
import * as SQLite from 'expo-sqlite';
import type { BBTalk } from '../types';
import { getSession, isCurrentSession, type Session } from './session';
import { logError } from '../utils/errorHandler';

let db: SQLite.SQLiteDatabase | null = null;
function getDB(): SQLite.SQLiteDatabase {
  if (!db) db = SQLite.openDatabaseSync('bbtalk_cache.db');
  return db;
}

export async function initCacheDB(): Promise<void> {
  const database = getDB();
  database.withTransactionSync(() => {
    database.execSync(`
      CREATE TABLE IF NOT EXISTS scoped_bbtalks (
        scope TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
        position INTEGER NOT NULL, PRIMARY KEY (scope, id)
      );
      CREATE TABLE IF NOT EXISTS scoped_meta (
        scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
        PRIMARY KEY (scope, key)
      );
      DROP TABLE IF EXISTS bbtalks;
      DROP TABLE IF EXISTS meta;
    `);
  });
}

function canAccess(session: Session): boolean {
  return session.scope !== null && isCurrentSession(session);
}

export async function cacheBBTalks(bbtalks: BBTalk[], session = getSession()): Promise<void> {
  if (!canAccess(session)) return;
  const database = getDB();
  database.withTransactionSync(() => {
    database.runSync('DELETE FROM scoped_bbtalks WHERE scope = ?', [session.scope!]);
    bbtalks.forEach((item, position) => database.runSync(
      'INSERT OR REPLACE INTO scoped_bbtalks (scope, id, data, position) VALUES (?, ?, ?, ?)',
      [session.scope!, item.id, JSON.stringify(item), position],
    ));
  });
}

export async function getCachedBBTalks(session = getSession()): Promise<BBTalk[]> {
  if (!canAccess(session)) return [];
  try {
    const rows = getDB().getAllSync<{ id: string; data: string }>(
      'SELECT id, data FROM scoped_bbtalks WHERE scope = ? ORDER BY position ASC', [session.scope!],
    );
    return rows.flatMap(row => {
      try { return [JSON.parse(row.data) as BBTalk]; }
      catch (error) { logError(error, `parse cached bbtalk id=${row.id}`); return []; }
    });
  } catch (error) {
    logError(error, 'getCachedBBTalks');
    return [];
  }
}

/** Clear only this account's records and sync time. */
export async function clearCache(session = getSession()): Promise<void> {
  if (!canAccess(session)) return;
  const database = getDB();
  database.withTransactionSync(() => {
    database.runSync('DELETE FROM scoped_bbtalks WHERE scope = ?', [session.scope!]);
    database.runSync('DELETE FROM scoped_meta WHERE scope = ?', [session.scope!]);
  });
}

export async function getLastSyncTime(session = getSession()): Promise<string | null> {
  if (!canAccess(session)) return null;
  try {
    return getDB().getFirstSync<{ value: string }>(
      'SELECT value FROM scoped_meta WHERE scope = ? AND key = ?',
      [session.scope!, 'last_sync_time'],
    )?.value ?? null;
  } catch (error) { logError(error, 'getLastSyncTime'); return null; }
}

export async function setLastSyncTime(timestamp: string, session = getSession()): Promise<void> {
  if (!canAccess(session)) return;
  getDB().runSync('INSERT OR REPLACE INTO scoped_meta (scope, key, value) VALUES (?, ?, ?)',
    [session.scope!, 'last_sync_time', timestamp]);
}
