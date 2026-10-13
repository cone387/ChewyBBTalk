import { normalizeAttachmentUrl } from '../../src/services/attachmentUrl';
jest.mock('../../src/config', () => ({ getApiBaseUrl: () => 'https://server.example' }));
jest.mock('../../src/services/api/apiClient', () => ({ apiClient: { get: jest.fn() } }));
import { apiClient } from '../../src/services/api/apiClient';
import { bbtalkApi, transformBBTalk } from '../../src/services/api/bbtalkApi';
beforeEach(() => jest.resetAllMocks());
const wire = { uid: 'record', content: 'body' };
const page = (items: unknown[], page = 1, has_more = false) => ({ items, total: 21, total_count: 45, page, page_size: 20, has_more, revision: 'r1' });
it('preserves canonical pagination metadata for records and comments', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue(page([wire], 2, true));
  expect(await bbtalkApi.getBBTalks({ page: 2 })).toMatchObject({ items: [{ id: 'record' }], total: 21, totalCount: 45, page: 2, page_size: 20, has_more: true });
  expect(await bbtalkApi.getCommentPage('record', 2)).toMatchObject({ items: [{ uid: 'record' }], total: 21, page: 2, page_size: 20, has_more: true, revision: 'r1' });
});

it('canonicalizes stored attachment API paths and preserves remote object URLs', () => {
  const record = transformBBTalk({ uid: 'r', attachments: [
    { uid: 'a', preview_url: '/api/v1/attachments/files/a/preview/' },
  ] });
  expect(normalizeAttachmentUrl('https://cdn.example/api/v1/attachments/files/b/preview/', 'https://server.example')).toBe('https://cdn.example/api/v1/attachments/files/b/preview/');
  expect(normalizeAttachmentUrl('https://server.example/api/v1/attachments/files/b/download/?key=1', 'https://server.example')).toBe('https://server.example/api/v1/attachments/files/b/download?key=1');
  expect(record.attachments[0].url).toBe('https://server.example/api/v1/attachments/files/a/preview');

});
