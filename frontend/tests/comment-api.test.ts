import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/services/api/apiClient', () => ({ apiClient: { get: vi.fn() } }));
import { apiClient } from '../src/services/api/apiClient';
import { bbtalkApi, transformBBTalk } from '../src/services/api/bbtalkApi';
const reply = { uid: 'c1', user: 2, content: 'reply', create_time: 'created', update_time: 'updated' };
beforeEach(() => vi.resetAllMocks());

it('maps embedded previews and preserves a missing preview for old servers', () => {
  expect(transformBBTalk({ uid: 'record', comment_preview: [reply], comments_revision: 'v1' })).toMatchObject({
    commentPreview: [{ uid: 'c1', content: 'reply', userDisplayName: '', createdAt: 'created' }], commentsRevision: 'v1',
  });
  expect(transformBBTalk({ uid: 'record' }).commentPreview).toBeUndefined();
  expect(transformBBTalk({ uid: 'record', comment_preview: [] }).commentPreview).toEqual([]);
});

it.each([false, true])('maps paginated comments and bounded page size (public=%s)', async isPublic => {
  vi.mocked(apiClient.get).mockResolvedValue({ count: 21, next: '?page=2', previous: null, results: [reply], revision: 'v1' });
  expect(await bbtalkApi.getCommentPage('record', 1, isPublic)).toMatchObject({ count: 21, next: '?page=2', results: [{ uid: 'c1', content: 'reply' }], revision: 'v1' });
  expect(apiClient.get).toHaveBeenCalledWith(`/api/v1/bbtalk/${isPublic ? 'public/' : ''}record/comments`, { page: 1, page_size: 20 });
});

it('accepts full-array responses from older servers', async () => {
  vi.mocked(apiClient.get).mockResolvedValue([reply]);
  expect(await bbtalkApi.getCommentPage('record')).toMatchObject({ count: 1, next: null, previous: null, revision: '', results: [{ uid: 'c1' }] });
});
