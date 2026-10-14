import initSqlJs, { type Database } from 'sql.js';
import type { BBTalk } from '../../src/types';
import { setSession, clearSession, getSession } from '../../src/services/session';
import { initCacheDB, cacheBBTalks, getCachedBBTalks, clearCache, setLastSyncTime, getLastSyncTime } from '../../src/services/offlineCacheService';

let mockDatabase: Database;
let mockSyncCalls = 0;
let mockBeforeAsync: ((sql: string) => Promise<void>) | undefined;
const mockQuery = (sql: string, params: any[] = []) => {
  const query = mockDatabase.prepare(sql);
  try {
    query.bind(params);
    const rows = [];
    while (query.step()) rows.push(query.getAsObject());
    return rows;
  } finally { query.free(); }
};
const mockAsync = async <T,>(sql: string, operation: () => T): Promise<T> => {
  // Native asynchronous SQLite work returns control to the event loop.
  await new Promise<void>(resolve => setImmediate(resolve));
  await mockBeforeAsync?.(sql);
  return operation();
};
const mockConnection = {
  execSync: (sql: string) => { mockSyncCalls++; return mockDatabase.exec(sql); },
  runSync: (sql: string, params: any[] = []) => { mockSyncCalls++; return mockDatabase.run(sql, params); },
  withTransactionSync: (callback: () => void) => {
    mockDatabase.run('BEGIN');
    try { callback(); mockDatabase.run('COMMIT'); }
    catch (error) { mockDatabase.run('ROLLBACK'); throw error; }
  },
  getAllSync: (sql: string, params: any[] = []) => { mockSyncCalls++; return mockQuery(sql, params); },
  getFirstSync: (sql: string, params: any[] = []) => { mockSyncCalls++; return mockQuery(sql, params)[0] ?? null; },
  execAsync: (sql: string) => mockAsync(sql, () => mockDatabase.exec(sql)),
  runAsync: (sql: string, params: any[] = []) => mockAsync(sql, () => mockDatabase.run(sql, params)),
  getAllAsync: (sql: string, params: any[] = []) => mockAsync(sql, () => mockQuery(sql, params)),
  getFirstAsync: (sql: string, params: any[] = []) => mockAsync(sql, () => mockQuery(sql, params)[0] ?? null),
  withTransactionAsync: async (callback: () => Promise<void>) => {
    await mockConnection.execAsync('BEGIN');
    try { await callback(); await mockConnection.execAsync('COMMIT'); }
    catch (error) { await mockConnection.execAsync('ROLLBACK'); throw error; }
  },
};
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => { mockSyncCalls++; return mockConnection; },
  openDatabaseAsync: async () => mockConnection,
}));
jest.mock('../../src/utils/errorHandler', () => ({ logError: jest.fn() }));

const talk = (content: string): BBTalk => ({
  id: 'same-id', content, visibility: 'private', tags: [], attachments: [],
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
});
beforeAll(async () => { const SQL = await initSqlJs(); mockDatabase = new SQL.Database(); });
beforeEach(async () => {
  mockBeforeAsync = undefined;
  mockSyncCalls = 0;
  clearSession();
  await initCacheDB();
  mockDatabase.run('DELETE FROM scoped_bbtalks; DELETE FROM scoped_meta;');
});
afterAll(() => mockDatabase.close());

it('yields to navigation work while replacing a feed snapshot without synchronous SQLite calls', async () => {
  setSession('https://a.test', 1);
  let navigationTurnRan = false;
  const navigationTurn = new Promise<void>(resolve => setImmediate(() => { navigationTurnRan = true; resolve(); }));
  await cacheBBTalks(Array.from({ length: 40 }, (_, index) => ({ ...talk(`row ${index}`), id: `row-${index}` })));
  const yieldedDuringWrite = navigationTurnRan;
  await navigationTurn;
  expect(yieldedDuringWrite).toBe(true);
  expect(mockSyncCalls).toBe(0);
  expect(await getCachedBBTalks()).toHaveLength(40);
});

it('serializes overlapping snapshots, reads and clear without exposing partially replaced rows', async () => {
  setSession('https://a.test', 1);
  await cacheBBTalks([talk('original')]);
  let release!: () => void;
  let entered!: () => void;
  const paused = new Promise<void>(resolve => { entered = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  mockBeforeAsync = async sql => {
    if (!sql.startsWith('INSERT')) return;
    mockBeforeAsync = undefined;
    entered();
    await resume;
  };
  const first = cacheBBTalks([talk('first'), { ...talk('first next'), id: 'next' }]);
  await paused;
  let readFinished = false;
  const read = getCachedBBTalks().then(rows => { readFinished = true; return rows; });
  const second = cacheBBTalks([talk('second')]);
  const clear = clearCache();
  await new Promise<void>(resolve => setImmediate(resolve));
  const readWasBlocked = !readFinished;
  release();
  await Promise.all([first, second, clear]);
  expect(readWasBlocked).toBe(true);
  expect(await read).toEqual([talk('first'), { ...talk('first next'), id: 'next' }]);
  expect(await getCachedBBTalks()).toEqual([]);
});

it('rolls back a failed replacement and allows later queued operations to recover', async () => {
  setSession('https://a.test', 1);
  await cacheBBTalks([talk('original')]);
  mockDatabase.run("CREATE TRIGGER fail_cache BEFORE INSERT ON scoped_bbtalks WHEN NEW.id = 'reject' BEGIN SELECT RAISE(ABORT, 'disk write failed'); END;");
  try {
    await expect(cacheBBTalks([talk('partial'), { ...talk('rejected'), id: 'reject' }])).rejects.toThrow('disk write failed');
    expect(await getCachedBBTalks()).toEqual([talk('original')]);
    await cacheBBTalks([talk('recovered')]);
    expect(await getCachedBBTalks()).toEqual([talk('recovered')]);
  } finally { mockDatabase.run('DROP TRIGGER fail_cache'); }
});

it('rolls back in-flight old-account writes and skips queued old-session operations', async () => {
  setSession('https://a.test', 1);
  await cacheBBTalks([talk('original')]);
  await setLastSyncTime('original-sync');
  const originalSession = getSession();
  let release!: () => void;
  let entered!: () => void;
  const paused = new Promise<void>(resolve => { entered = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  mockBeforeAsync = async sql => {
    if (!sql.startsWith('INSERT')) return;
    mockBeforeAsync = undefined;
    entered(); await resume;
  };
  const writing = cacheBBTalks([talk('interrupted')]);
  await paused;
  const staleWrite = cacheBBTalks([talk('stale')]);
  const staleClear = clearCache();
  const staleMeta = setLastSyncTime('stale-sync');
  setSession('https://a.test', 2);
  const newWrite = cacheBBTalks([talk('Bob')]);
  release();
  await Promise.all([writing, staleWrite, staleClear, staleMeta, newWrite]);
  expect(await getCachedBBTalks()).toEqual([talk('Bob')]);
  expect(await getCachedBBTalks(originalSession)).toEqual([]);
  setSession('https://a.test', 1);
  expect(await getCachedBBTalks()).toEqual([talk('original')]);
  expect(await getLastSyncTime()).toBe('original-sync');
});

it.each(['records', 'sync time'])('does not return %s after the account changes during a native read', async kind => {
  setSession('https://a.test', 1);
  await cacheBBTalks([talk('private')]);
  await setLastSyncTime('private-sync');
  mockBeforeAsync = async sql => {
    if (!sql.startsWith('SELECT')) return;
    mockBeforeAsync = undefined;
    setSession('https://a.test', 2);
  };
  if (kind === 'records') expect(await getCachedBBTalks()).toEqual([]);
  else expect(await getLastSyncTime()).toBeNull();
});

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
