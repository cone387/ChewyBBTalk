import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/services/api/apiClient', () => ({ apiClient: { get: vi.fn() } }));
import { apiClient } from '../src/services/api/apiClient';
import { bbtalkApi, transformBBTalk } from '../src/services/api/bbtalkApi';
const reply = { uid: 'c1', user: 2, content: 'reply', create_time: 'created', update_time: 'updated' };
beforeEach(() => vi.resetAllMocks());

it('maps embedded previews and preserves a missing preview', () => {
  expect(transformBBTalk({ uid: 'record', comment_preview: [reply], comments_revision: 'v1' })).toMatchObject({
    commentPreview: [{ uid: 'c1', content: 'reply', userDisplayName: '', createdAt: 'created' }], commentsRevision: 'v1',
  });
  expect(transformBBTalk({ uid: 'record' }).commentPreview).toBeUndefined();
  expect(transformBBTalk({ uid: 'record', comment_preview: [] }).commentPreview).toEqual([]);
});

it.each([false, true])('maps paginated comments and bounded page size (public=%s)', async isPublic => {
  vi.mocked(apiClient.get).mockResolvedValue({ total: 21, has_more: true, page: 1, page_size: 20, items: [reply], revision: 'v1' });
  expect(await bbtalkApi.getCommentPage('record', 1, isPublic)).toMatchObject({ total: 21, has_more: true, items: [{ uid: 'c1', content: 'reply' }], revision: 'v1' });
  expect(apiClient.get).toHaveBeenCalledWith(`/api/v1/bbtalk/${isPublic ? 'public/' : ''}record/comments`, { page: 1, page_size: 20 });
});

it('rejects an invalid comment array response', async () => {
  vi.mocked(apiClient.get).mockResolvedValue([reply]);
  await expect(bbtalkApi.getCommentPage('record')).rejects.toThrow();
});
