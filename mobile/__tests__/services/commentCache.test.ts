jest.mock('../../src/services/api/bbtalkApi', () => ({ bbtalkApi: { getComments: jest.fn(), getCommentPage: jest.fn() } }));
import { commentEntry, loadCommentEntry, invalidateCommentPages } from '../../src/services/commentCache';
import { bbtalkApi } from '../../src/services/api/bbtalkApi';
import { clearSession, setSession } from '../../src/services/session';
import type { Comment } from '../../src/types';
const comment = (uid: string): Comment => ({ uid, content: uid, user: 1, userDisplayName: '', userAvatar: '', userUsername: '', createdAt: '', updatedAt: '' });
const page = bbtalkApi.getCommentPage as jest.Mock;
beforeEach(() => { jest.resetAllMocks(); clearSession(); setSession('https://server.example', 'alice'); });

it('coalesces simultaneous comment consumers and clears reuse on session replacement', async () => {
  let finish!: (value: any) => void;
  page.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const entry = commentEntry('a', [], 'r1');
  const first = loadCommentEntry('a', entry, false);
  const second = loadCommentEntry('a', entry, false);
  expect(page).toHaveBeenCalledTimes(1);
  finish({ results: [comment('a')], next: null, revision: 'r1' }); await Promise.all([first, second]);
  expect(commentEntry('a', [], 'r1').comments[0].uid).toBe('a');
  clearSession(); setSession('https://server.example', 'alice');
  expect(commentEntry('a', [], 'r1').comments).toEqual([]);
});
it('uses the first page revision when the collection changed since the feed preview', async () => {
  page.mockResolvedValueOnce({ results: [comment('a')], next: 'p2', revision: 'r2' })
    .mockResolvedValueOnce({ results: [comment('b')], next: null, revision: 'r2' });
  const entry = commentEntry('a', [], 'r1');
  await loadCommentEntry('a', entry, false); await loadCommentEntry('a', entry, false);
  expect(entry.comments.map(c => c.uid)).toEqual(['a', 'b']);
});
it('restarts pagination after deletion instead of skipping an offset-shifted comment', async () => {
  page.mockResolvedValueOnce({ results: [comment('a'), comment('b')], next: 'p2', revision: 'r1' })
    .mockResolvedValueOnce({ results: [comment('b'), comment('c')], next: null, revision: 'r2' });
  const entry = commentEntry('a', [], 'r1');
  await loadCommentEntry('a', entry, false);
  entry.deleted.add('a'); entry.comments = entry.comments.filter(c => c.uid !== 'a');
  invalidateCommentPages(entry);
  await loadCommentEntry('a', entry, false);
  expect(page).toHaveBeenLastCalledWith('a', 1);
  expect(entry.comments.map(c => c.uid)).toEqual(['b', 'c']);
});
it('bounds short-lived reuse and expires idle entries', () => {
  const old = commentEntry('old', [comment('private')], 'r1');
  for (let i = 0; i < 100; i++) commentEntry(String(i), [], 'r1');
  expect(commentEntry('old', [], 'r1')).not.toBe(old);
  const current = commentEntry('current', [], 'r1'); current.touched = Date.now() - 300001;
  expect(commentEntry('current', [], 'r1')).not.toBe(current);
});
