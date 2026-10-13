import AsyncStorage from '@react-native-async-storage/async-storage';
import { listDrafts, readDraft, waitForDraftWrites, writeDraft } from '../../src/services/drafts';
import { clearSession, getSession, setSession } from '../../src/services/session';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); clearSession(); setSession('https://draft.example', 'owner'); });

test('ordered clear waits for an in-flight write and read waits for clear', async () => {
  let release!: () => void;
  (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const saved = writeDraft('draft', { content: 'old' }, getSession());
  await Promise.resolve(); await Promise.resolve();
  const cleared = writeDraft('draft', null, getSession());
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  release(); await saved; await cleared;
  expect(await readDraft('draft')).toBeNull();
});

test('draft directory includes attachment-only and edit drafts but excludes empty and other accounts', async () => {
  const session = getSession();
  const prefix = `compose_draft:${session.scope}`;
  await writeDraft(prefix, { version: 1, content: '', attachments: [], pendingMedia: [{ id: 'photo' }] }, session);
  await writeDraft(`${prefix}:edit:r1`, { version: 1, content: '修改', attachments: [], pendingMedia: [] }, session);
  await writeDraft(`${prefix}:locked:empty`, { version: 1, content: '', attachments: [], pendingMedia: [] }, session);
  await writeDraft('compose_draft:another', { content: '别人的秘密' }, session);
  expect(await listDrafts(session)).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: prefix, preview: '附件记录', pendingCount: 1 }),
    expect.objectContaining({ key: `${prefix}:edit:r1`, preview: '修改', recordId: 'r1' }),
  ]));
  expect(await listDrafts(session)).toHaveLength(2);
  setSession('https://draft.example', 'another');
  await expect(listDrafts(session)).rejects.toThrow('账号已切换');
  expect(await listDrafts(getSession())).toEqual([]);
});

test('failed writes remain retryable without poisoning the queue', async () => {
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  await expect(writeDraft('draft', { content: 'keep me' }, getSession())).rejects.toThrow('disk full');
  await writeDraft('draft', { content: 'keep me' }, getSession());
  expect(JSON.parse((await readDraft('draft'))!).content).toBe('keep me');
});

test('a queued old-session write cannot run under another account', async () => {
  const pending = writeDraft('draft', { content: 'private' }, getSession());
  clearSession(); setSession('https://draft.example', 'another');
  await expect(pending).rejects.toThrow('账号已切换');
  expect(await readDraft('draft')).toBeNull();
});

test('waitForDraftWrites resolves only after the scope drafts settle', async () => {
  const scope = 'https://wait.example|owner';
  let release!: () => void;
  (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(
    () => new Promise<void>(resolve => { release = resolve; }),
  );
  const scoped = writeDraft(`compose_draft:${scope}`, { content: 'scoped' }, getSession());
  await writeDraft('compose_draft:other-scope', { content: 'unrelated' }, getSession());
  let released = false;
  const waited = waitForDraftWrites(scope).then(() => { released = true; return 'done' as const; });
  await Promise.resolve(); await Promise.resolve();
  expect(released).toBe(false);
  release();
  await scoped;
  expect(await waited).toBe('done');
  expect(released).toBe(true);
});

test('waitForDraftWrites settles when a scope draft failed and was abandoned', async () => {
  const scope = 'https://wait.example|owner';
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  await expect(writeDraft(`compose_draft:${scope}`, { content: 'lost' }, getSession())).rejects.toThrow('disk full');
  await expect(waitForDraftWrites(scope)).resolves.toBeUndefined();
  await expect(waitForDraftWrites('https://nobody.example|none')).resolves.toBeUndefined();
});

test('a crash between queue persistence and draft cleanup cannot restore the transferred draft', async () => {
  const session = getSession(); const key = `compose_draft:${session.scope}`;
  const draft = { content: 'already queued', draftId: 'original' };
  await writeDraft(key, draft, session);
  await AsyncStorage.setItem(`outbox:${session.scope}`, JSON.stringify([{ id: 'q1', state: 'queued', sourceDraftKey: key, draft }]));
  expect(await readDraft(key)).toBeNull();
  expect(await listDrafts(session)).toEqual([]);
  await writeDraft(key, { content: 'already queued', draftId: 'new recording' }, session);
  expect(await readDraft(key)).not.toBeNull();
});
