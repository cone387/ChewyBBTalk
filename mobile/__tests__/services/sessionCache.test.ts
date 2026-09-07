import initSqlJs, { type Database } from 'sql.js';
import type { BBTalk } from '../../src/types';
import { setSession, clearSession, getSession } from '../../src/services/session';
import { initCacheDB, cacheBBTalks, getCachedBBTalks, clearCache, setLastSyncTime, getLastSyncTime } from '../../src/services/offlineCacheService';

let mockDatabase: Database;
jest.mock('expo-sqlite', () => ({ openDatabaseSync: () => ({
  execSync: (sql: string) => mockDatabase.exec(sql),
  runSync: (sql: string, params: any[] = []) => mockDatabase.run(sql, params),
  withTransactionSync: (callback: () => void) => {
    mockDatabase.run('BEGIN');
    try { callback(); mockDatabase.run('COMMIT'); }
    catch (error) { mockDatabase.run('ROLLBACK'); throw error; }
  },
  getAllSync: (sql: string, params: any[] = []) => {
    const query = mockDatabase.prepare(sql);
    try {
      query.bind(params);
      const rows = [];
      while (query.step()) rows.push(query.getAsObject());
      return rows;
    } finally { query.free(); }
  },
  getFirstSync: (sql: string, params: any[] = []) => {
    const query = mockDatabase.prepare(sql);
    try { query.bind(params); return query.step() ? query.getAsObject() : null; }
    finally { query.free(); }
  },
}) }));
jest.mock('../../src/utils/errorHandler', () => ({ logError: jest.fn() }));

const talk = (content: string): BBTalk => ({
  id: 'same-id', content, visibility: 'private', tags: [], attachments: [],
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
});
beforeAll(async () => { const SQL = await initSqlJs(); mockDatabase = new SQL.Database(); });
beforeEach(async () => {
  clearSession();
  await initCacheDB();
  mockDatabase.run('DELETE FROM scoped_bbtalks; DELETE FROM scoped_meta;');
});
afterAll(() => mockDatabase.close());

it('isolates identical record/user IDs across accounts and servers using real SQLite queries', async () => {
  setSession('https://a.test', 1);
  await cacheBBTalks([talk('Alice')]);
  await setLastSyncTime('alice-sync');
  setSession('https://a.test', 2);
  expect(await getCachedBBTalks()).toEqual([]);
  expect(await getLastSyncTime()).toBeNull();
  await cacheBBTalks([talk('Bob')]);
  setSession('https://b.test', 1);
  expect(await getCachedBBTalks()).toEqual([]);
  await cacheBBTalks([talk('Other server')]);
  setSession('https://a.test/', 1);
  expect(await getCachedBBTalks()).toEqual([talk('Alice')]);
  expect(await getLastSyncTime()).toBe('alice-sync');
  await clearCache();
  setSession('https://a.test', 2);
  expect(await getCachedBBTalks()).toEqual([talk('Bob')]);
});

it('rejects captured old sessions and does not expose data while logged out', async () => {
  setSession('https://a.test', 1);
  const old = getSession();
  await cacheBBTalks([talk('Alice')]);
  clearSession();
  expect(await getCachedBBTalks()).toEqual([]);
  setSession('https://a.test', 2);
  await cacheBBTalks([talk('stale')], old);
  await setLastSyncTime('stale', old);
  expect(await getCachedBBTalks(old)).toEqual([]);
  expect(await getCachedBBTalks()).toEqual([]);
  expect(await getLastSyncTime()).toBeNull();
});

it('discards unowned legacy cache and supports empty authoritative results and ordered rows', async () => {
  mockDatabase.run("CREATE TABLE bbtalks (data TEXT); INSERT INTO bbtalks VALUES ('private legacy'); CREATE TABLE meta (value TEXT);");
  await initCacheDB();
  setSession('https://a.test', 1);
  expect(await getCachedBBTalks()).toEqual([]);
  const rows = [talk('pinned'), { ...talk('second'), id: 'another' }];
  await cacheBBTalks(rows);
  expect(await getCachedBBTalks()).toEqual(rows);
  await cacheBBTalks([]);
  expect(await getCachedBBTalks()).toEqual([]);
});
