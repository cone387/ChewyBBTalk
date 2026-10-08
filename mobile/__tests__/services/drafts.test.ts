import AsyncStorage from '@react-native-async-storage/async-storage';
import { readDraft, waitForDraftWrites, writeDraft } from '../../src/services/drafts';
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
