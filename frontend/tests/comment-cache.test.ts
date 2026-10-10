import { beforeEach, expect, it, vi } from 'vitest';
import { commentCache } from '../src/services/cache/commentCache';
import type { Comment, CommentPage } from '../src/types';
const auth = vi.hoisted(() => ({ session: 'user1/session1' }));
vi.mock('../src/services/authSessionScope', () => ({ getAuthSessionScope: () => auth.session, subscribeAuthSession: () => () => {} }));

function comment(n: number): Comment { return { uid: String(n), user: 1, content: String(n), userAvatar: '', userDisplayName: '', userUsername: '', createdAt: '', updatedAt: '' }; }
const seed = (revision = 'v1', isPublic = false) => commentCache.seed('r', 5, [1, 2, 3].map(comment), revision, isPublic);
const page = (revision = 'v1', results = [1, 2, 3, 4, 5]): CommentPage => ({ count: 5, next: null, previous: null, results: results.map(comment), revision });
beforeEach(() => { commentCache.clear(); auth.session = 'user1/session1'; });

it('deduplicates concurrent pages and retains them across mounts', async () => {
  seed();
  const load = vi.fn(async () => page());
  const [first, second] = await Promise.all([commentCache.load('r', false, 1, load), commentCache.load('r', false, 1, load)]);
  expect(first).toBe(second);
  expect(seed()).toBe(first);
  expect(await commentCache.load('r', false, 1, load)).toBe(first);
  expect(load).toHaveBeenCalledTimes(1);
});

it.each(['user2/session2', 'user1/session2'])('rejects old account/session responses on %s', async session => {
  seed();
  let finish!: (value: CommentPage) => void;
  const pending = commentCache.load('r', false, 1, () => new Promise(resolve => { finish = resolve; }));
  const rejected = expect(pending).rejects.toThrow('已失效');
  auth.session = session;
  const current = seed();
  finish(page());
  await rejected;
  expect(seed()).toBe(current);
  expect(current.comments).toHaveLength(3);
});

it('replaces in-flight pages after revision changes without joining their stale promise', async () => {
  seed();
  let finish!: (value: CommentPage) => void;
  const pending = commentCache.load('r', false, 1, () => new Promise(resolve => { finish = resolve; }));
  const rejected = expect(pending).rejects.toThrow('已失效');
  seed('v2');
  const fresh = await commentCache.load('r', false, 1, async () => page('v2', [2, 3, 4, 5, 6]));
  finish(page());
  await rejected;
  expect(seed('v2')).toBe(fresh);
});

it('does not join pending pre-mutation pages or overwrite a local comment', async () => {
  seed();
  let finish!: (value: CommentPage) => void;
  const pending = commentCache.load('r', false, 1, () => new Promise(resolve => { finish = resolve; }));
  const rejected = expect(pending).rejects.toThrow('已失效');
  commentCache.mutate('r', false, { add: comment(6) });
  const fresh = await commentCache.load('r', false, 1, async () => ({ ...page('v2', [1, 2, 3, 4, 5, 6]), count: 6 }));
  finish(page());
  await rejected;
  expect(seed()).toBe(fresh);
  expect(fresh.count).toBe(6);
});

it('restarts from page one when another client mutates the collection between pages', async () => {
  seed();
  await commentCache.load('r', false, 1, async () => ({ ...page('v1', [1, 2, 3]), next: '?page=2' }));
  const loader = vi.fn(async (n: number) => n === 2 ? page('v2', [5]) : page('v2', [2, 3, 4, 5]));
  const current = await commentCache.load('r', false, 2, loader);
  expect(loader.mock.calls).toEqual([[2], [1]]);
  expect(current.comments.map(c => c.uid)).toEqual(['2', '3', '4', '5']);
});

it('keeps public and private reads separate', async () => {
  seed();
  seed('v1', true);
  const loader = vi.fn(async () => page());
  await commentCache.load('r', false, 1, loader);
  expect(seed('v1', true).comments).toHaveLength(3);
});

it('does not double-count mutations that a concurrent refresh already included', async () => {
  seed();
  await commentCache.load('r', false, 1, async () => page());
  expect(commentCache.mutate('r', false, { add: comment(5) }).count).toBe(5);
  expect(commentCache.mutate('r', false, { remove: '9' }).count).toBe(5);
});
