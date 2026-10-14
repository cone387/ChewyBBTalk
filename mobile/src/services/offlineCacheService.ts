/** Native read cache, isolated by server + account. Never adopts legacy rows. */
import * as SQLite from 'expo-sqlite';
import type { BBTalk } from '../types';
import { getSession, isCurrentSession, type Session } from './session';
import { logError } from '../utils/errorHandler';

let db: Promise<SQLite.SQLiteDatabase> | null = null;
let pending: Promise<void> = Promise.resolve();
function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!db) db = SQLite.openDatabaseAsync('bbtalk_cache.db').catch(error => { db = null; throw error; });
  return db;
}

// Expo's async transactions share a connection. Serialize reads as well as writes so
// no operation can join another snapshot's transaction or observe its partial rows.
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const operation = pending.then(work);
  pending = operation.then(() => {}, () => {});
  return operation;
}

export function initCacheDB(): Promise<void> {
  return serialize(async () => {
    const database = await getDB();
    await database.withTransactionAsync(async () => {
      await database.execAsync(`
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
  });
}

function canAccess(session: Session): boolean {
  return session.scope !== null && isCurrentSession(session);
}

const sessionChanged = new Error('Cache session changed');
function assertAccess(session: Session) {
  if (!canAccess(session)) throw sessionChanged;
}

function writeForSession(session: Session, work: (database: SQLite.SQLiteDatabase) => Promise<void>): Promise<void> {
  return serialize(async () => {
    if (!canAccess(session)) return;
    const database = await getDB();
    if (!canAccess(session)) return;
    try {
      await database.withTransactionAsync(async () => {
        assertAccess(session);
        await work(database);
        // A session change during native I/O must roll back the whole snapshot.
        assertAccess(session);
      });
    } catch (error) { if (error !== sessionChanged) throw error; }
  });
}

export async function cacheBBTalks(bbtalks: BBTalk[], session = getSession()): Promise<void> {
  if (!canAccess(session)) return;
  // Redux rows are immutable; retain this list while later renders replace theirs.
  const snapshot = bbtalks.slice();
  await writeForSession(session, async database => {
    await database.runAsync('DELETE FROM scoped_bbtalks WHERE scope = ?', [session.scope!]);
    for (let position = 0; position < snapshot.length; position++) {
      assertAccess(session);
      const item = snapshot[position];
      await database.runAsync(
        'INSERT OR REPLACE INTO scoped_bbtalks (scope, id, data, position) VALUES (?, ?, ?, ?)',
        [session.scope!, item.id, JSON.stringify(item), position],
      );
    }
  });
}

export async function getCachedBBTalks(session = getSession()): Promise<BBTalk[]> {
  if (!canAccess(session)) return [];
  try {
    const rows = await serialize(async () => {
      if (!canAccess(session)) return [];
      const database = await getDB();
      if (!canAccess(session)) return [];
      return database.getAllAsync<{ id: string; data: string }>(
        'SELECT id, data FROM scoped_bbtalks WHERE scope = ? ORDER BY position ASC', [session.scope!],
      );
    });
    if (!canAccess(session)) return [];
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
  await writeForSession(session, async database => {
    await database.runAsync('DELETE FROM scoped_bbtalks WHERE scope = ?', [session.scope!]);
    assertAccess(session);
    await database.runAsync('DELETE FROM scoped_meta WHERE scope = ?', [session.scope!]);
  });
}

export async function getLastSyncTime(session = getSession()): Promise<string | null> {
  if (!canAccess(session)) return null;
  try {
    const row = await serialize(async () => {
      if (!canAccess(session)) return null;
      const database = await getDB();
      if (!canAccess(session)) return null;
      return database.getFirstAsync<{ value: string }>(
        'SELECT value FROM scoped_meta WHERE scope = ? AND key = ?',
        [session.scope!, 'last_sync_time'],
      );
    });
    return canAccess(session) ? row?.value ?? null : null;
  } catch (error) { logError(error, 'getLastSyncTime'); return null; }
}

export async function setLastSyncTime(timestamp: string, session = getSession()): Promise<void> {
  if (!canAccess(session)) return;
  await writeForSession(session, async database => {
    await database.runAsync('INSERT OR REPLACE INTO scoped_meta (scope, key, value) VALUES (?, ?, ?)',
      [session.scope!, 'last_sync_time', timestamp]);
  });
}
