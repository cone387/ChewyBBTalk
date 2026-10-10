jest.mock('../../src/services/api/apiClient', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }));
jest.mock('../../src/config', () => ({ getApiBaseUrl: () => 'https://example.com' }));
import { apiClient } from '../../src/services/api/apiClient';
import { bbtalkApi, transformBBTalk } from '../../src/services/api/bbtalkApi';
import { tagApi } from '../../src/services/api/tagApi';
import { userApi } from '../../src/services/api/userApi';
const wire = { uid: 'record', content: 'body', create_time: 'created', update_time: 'updated' };
beforeEach(() => { jest.resetAllMocks(); (apiClient.post as jest.Mock).mockResolvedValue(wire); (apiClient.patch as jest.Mock).mockResolvedValue(wire); });
it('maps record defaults and all tag/comment metadata from the wire format', () => {
  const record = transformBBTalk({ ...wire, tags: [{ uid: 'tag', name: 'Work', sort_order: 2, bbtalk_count: 3 }], comment_count: 4, is_pinned: true });
  expect(record).toMatchObject({ id: 'record', visibility: 'private', context: {}, attachments: [], isPinned: true, commentCount: 4, createdAt: 'created', updatedAt: 'updated' });
  expect(record.tags[0]).toMatchObject({ id: 'tag', sortOrder: 2, bbtalkCount: 3 });
  expect(transformBBTalk(wire)).toMatchObject({ tags: [], isPinned: false, commentCount: 0 });
});
it.each([
  [{ uid: 'file', preview_url: 'http://localhost:8000/api/file/?q=1' }, 'https://example.com/api/file/?q=1'],
  [{ id: 'file', download_url: '/download/' }, 'https://example.com/download/'],
  [{ uid: 'file', url: 'old/storage/path' }, 'https://example.com/api/v1/attachments/files/file/preview'],
  [{ url: '/legacy/file' }, 'https://example.com/legacy/file'],
  [{ url: 'https://legacy.example/file' }, 'https://legacy.example/file'],
  [{ url: 'bare/storage/path' }, ''],
  // Bare non-http preview URLs are kept verbatim (no host rewrite, no apiBase join).
  [{ uid: 'file', preview_url: 'cdn/relative/file.jpg' }, 'cdn/relative/file.jpg'],
  // Without a uid the preview URL falls back to the numeric/local id.
  [{ id: 'legacy-7', url: 'old/storage/path' }, 'https://example.com/api/v1/attachments/files/legacy-7/preview'],
])('normalizes attachment previews for %j', (attachment, url) => {
  expect(transformBBTalk({ ...wire, attachments: [attachment] }).attachments[0]).toMatchObject({ url, type: 'file' });
});
it('serializes submission identity, attachments, tags and source context', async () => {
  await bbtalkApi.createBBTalk({ submissionKey: 'intent', content: 'body', tags: ['Work', 'Life'], visibility: 'private', attachments: [{ uid: 'file', url: 'url', type: 'image', originalFilename: 'original.jpg', mimeType: 'image/jpeg', fileSize: 5 }], context: { location: 'home' } });
  expect(apiClient.post).toHaveBeenCalledWith('/api/v1/bbtalk', expect.objectContaining({ tags: ['Work', 'Life'], visibility: 'private', attachments: [expect.objectContaining({ original_filename: 'original.jpg', mime_type: 'image/jpeg', file_size: 5 })], context: expect.objectContaining({ location: 'home', source: expect.objectContaining({ platform: 'mobile' }) }) }), { 'Idempotency-Key': 'intent' });
});
it('submits a minimal record without tags, attachments, visibility or idempotency key', async () => {
  (apiClient.post as jest.Mock).mockResolvedValueOnce(wire);
  await bbtalkApi.createBBTalk({ content: 'bare' });
  const [path, payload, headers] = (apiClient.post as jest.Mock).mock.calls[0];
  expect(path).toBe('/api/v1/bbtalk');
  expect(payload.content).toBe('bare');
  expect(payload.tags).toBeUndefined();
  expect(payload).not.toHaveProperty('attachments');
  expect(payload).not.toHaveProperty('visibility');
  expect(headers).toBeUndefined();
});
it('deletes records, toggles pins and reads date counts through their endpoints', async () => {
  await bbtalkApi.deleteBBTalk('record');
  expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/bbtalk/record');
  expect((await bbtalkApi.togglePin('record')).id).toBe('record');
  expect(apiClient.post).toHaveBeenCalledWith('/api/v1/bbtalk/record/pin');
  (apiClient.get as jest.Mock).mockResolvedValueOnce([{ date: '2026-10-08', count: 3 }]);
  expect(await bbtalkApi.getDateCounts({ year: 2026, month: 10 })).toEqual([{ date: '2026-10-08', count: 3 }]);
  expect(apiClient.get).toHaveBeenCalledWith('/api/v1/bbtalk/date-counts', { year: 2026, month: 10 });
});
it('allows explicitly clearing content, tags and attachments while preserving revision checks', async () => {
  await bbtalkApi.updateBBTalk('record', { content: '', tags: [], attachments: [], visibility: 'private' }, 'revision');
  expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/bbtalk/record', { content: '', tags: [], attachments: [], visibility: 'private' }, { 'If-Match': 'revision' });
  await bbtalkApi.updateBBTalk('record', {});
  expect(apiClient.patch).toHaveBeenLastCalledWith('/api/v1/bbtalk/record', {}, undefined);
});
it('maps private and public pagination without losing next-page markers or filters', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ count: 3, next: 'next', previous: null, results: [wire] });
  expect(await bbtalkApi.getBBTalks({ page: 2, search: 'body' })).toMatchObject({ count: 3, next: 'next', results: [{ id: 'record' }] });
  expect(apiClient.get).toHaveBeenCalledWith('/api/v1/bbtalk', { page: 2, search: 'body' });
  expect((await bbtalkApi.getPublicBBTalks({ page: 2 })).results[0].id).toBe('record');
});
it('maps comments with missing optional profile fields and preserves rich profiles', async () => {
  const comment = { uid: 'comment', user: 1, content: 'reply', create_time: 'created', update_time: 'updated' };
  (apiClient.get as jest.Mock).mockResolvedValue([comment, { ...comment, user_display_name: 'Alice', user_avatar: 'avatar', user_username: 'alice' }]);
  const comments = await bbtalkApi.getComments('record');
  expect(comments[0]).toMatchObject({ userDisplayName: '', userAvatar: '', userUsername: '', createdAt: 'created' });
  expect(comments[1]).toMatchObject({ userDisplayName: 'Alice', userAvatar: 'avatar', userUsername: 'alice' });
  (apiClient.post as jest.Mock).mockResolvedValue(comment);
  expect(await bbtalkApi.createComment('record', 'reply')).toMatchObject({ uid: 'comment', content: 'reply' });
  await bbtalkApi.deleteComment('record', 'comment');
  expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/bbtalk/record/comments/comment');
});
it.each([[{ uid: 'tag', name: 'Work' }], { results: [{ uid: 'tag', name: 'Work' }] }, {}])('accepts paginated, array or empty tag responses', async payload => {
  (apiClient.get as jest.Mock).mockResolvedValue(payload);
  const tags = await tagApi.getTags();
  expect(tags).toEqual('results' in payload || Array.isArray(payload) ? [expect.objectContaining({ id: 'tag', name: 'Work' })] : []);
});
it('preserves tag clearing and zero sort order without deleting associated records by default', async () => {
  await tagApi.createTag({ name: 'Work', color: '#000000', sortOrder: 0 });
  expect(apiClient.post).toHaveBeenCalledWith('/api/v1/bbtalk/tags', { name: 'Work', color: '#000000', sort_order: 0 });
  await tagApi.updateTag('tag', { name: '', color: '', sortOrder: 0 });
  expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/bbtalk/tags/tag', { name: '', color: '', sort_order: 0 });
  await tagApi.updateTag('tag', {});
  expect(apiClient.patch).toHaveBeenLastCalledWith('/api/v1/bbtalk/tags/tag', {});
  await tagApi.deleteTag('tag'); expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/bbtalk/tags/tag');
  await tagApi.deleteTag('tag', true); expect(apiClient.delete).toHaveBeenLastCalledWith('/api/v1/bbtalk/tags/tag?delete_bbtalks=true');
  await tagApi.reorder([{ uid: 'tag', sort_order: 0 }]);
  expect(apiClient.post).toHaveBeenLastCalledWith('/api/v1/bbtalk/tags/reorder', { items: [{ uid: 'tag', sort_order: 0 }] });
});
it('sends password and empty profile fields through the authenticated API', async () => {
  await userApi.changePassword('old', 'new');
  expect(apiClient.post).toHaveBeenCalledWith('/api/v1/bbtalk/user/change-password', { old_password: 'old', new_password: 'new' });
  await userApi.updateProfile({ email: '', bio: '' }); expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/bbtalk/user/me', { email: '', bio: '' });
  await userApi.deleteAccount('password'); expect(apiClient.post).toHaveBeenCalledWith('/api/v1/bbtalk/user/delete-account', { password: 'password' });
});

it('maps embedded comment previews and paginated comments', async () => {
 const c = { uid: 'comment', content: 'preview', user: 1, create_time: 'created', update_time: 'updated' };
 expect(transformBBTalk({ ...wire, comment_preview: [c], comments_revision: 'r1' })).toMatchObject({ commentPreview: [{ uid: 'comment', content: 'preview', createdAt: 'created' }], commentsRevision: 'r1' });
 (apiClient.get as jest.Mock).mockResolvedValue({ count: 21, next: 'page2', previous: null, results: [c], revision: 'r1' });
 expect(await bbtalkApi.getCommentPage('record', 1)).toMatchObject({ count: 21, next: 'page2', results: [{ uid: 'comment' }], revision: 'r1' });
 expect(apiClient.get).toHaveBeenCalledWith('/api/v1/bbtalk/record/comments', { page: 1, page_size: 20 });
});
