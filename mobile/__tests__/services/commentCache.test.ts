jest.mock('../../src/services/api/bbtalkApi', () => ({ bbtalkApi: { getCommentPage: jest.fn() } }));
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
  const first = loadCommentEntry('a', entry);
  const second = loadCommentEntry('a', entry);
  expect(page).toHaveBeenCalledTimes(1);
  finish({ items: [comment('a')], has_more: false, total: 2, page: 1, page_size: 20, revision: 'r1' }); await Promise.all([first, second]);
  expect(commentEntry('a', [], 'r1').comments[0].uid).toBe('a');
  clearSession(); setSession('https://server.example', 'alice');
  expect(commentEntry('a', [], 'r1').comments).toEqual([]);
});
it('uses the first page revision when the collection changed since the feed preview', async () => {
  page.mockResolvedValueOnce({ items: [comment('a')], has_more: true, total: 2, page: 1, page_size: 20, revision: 'r2' })
    .mockResolvedValueOnce({ items: [comment('b')], has_more: false, total: 2, page: 1, page_size: 20, revision: 'r2' });
  const entry = commentEntry('a', [], 'r1');
  await loadCommentEntry('a', entry); await loadCommentEntry('a', entry);
  expect(entry.comments.map(c => c.uid)).toEqual(['a', 'b']);
});
it('restarts pagination after deletion instead of skipping an offset-shifted comment', async () => {
  page.mockResolvedValueOnce({ items: [comment('a'), comment('b')], has_more: true, total: 2, page: 1, page_size: 20, revision: 'r1' })
    .mockResolvedValueOnce({ items: [comment('b'), comment('c')], has_more: false, total: 2, page: 1, page_size: 20, revision: 'r2' });
  const entry = commentEntry('a', [], 'r1');
  await loadCommentEntry('a', entry);
  entry.deleted.add('a'); entry.comments = entry.comments.filter(c => c.uid !== 'a');
  invalidateCommentPages(entry);
  await loadCommentEntry('a', entry);
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
