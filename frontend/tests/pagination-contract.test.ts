import { normalizeAttachmentUrl } from '../src/services/attachmentUrl';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/services/api/apiClient', () => ({ apiClient: { get: vi.fn() } }));
import { apiClient } from '../src/services/api/apiClient';
import { bbtalkApi, transformBBTalk } from '../src/services/api/bbtalkApi';
beforeEach(() => vi.resetAllMocks());
const wire = { uid: 'record', content: 'body' };
const page = (items: unknown[], page = 1, has_more = false) => ({ items, total: 21, total_count: 45, page, page_size: 20, has_more, revision: 'r1' });
it('preserves canonical pagination metadata for records and comments', async () => {
  vi.mocked(apiClient.get).mockResolvedValue(page([wire], 2, true));
  expect(await bbtalkApi.getBBTalks({ page: 2 })).toMatchObject({ items: [{ id: 'record' }], total: 21, totalCount: 45, page: 2, page_size: 20, has_more: true });
  expect(await bbtalkApi.getCommentPage('record', 2)).toMatchObject({ items: [{ uid: 'record' }], total: 21, page: 2, page_size: 20, has_more: true, revision: 'r1' });
});

it('canonicalizes stored attachment API paths and preserves remote object URLs', () => {
  const record = transformBBTalk({ uid: 'r', attachments: [
    { uid: 'a', url: '/api/v1/attachments/files/a/preview/' },
    { uid: 'b', url: 'https://cdn.example/api/v1/attachments/files/b/preview/' },
  ] });
  expect(normalizeAttachmentUrl('https://cdn.example/api/v1/attachments/files/b/preview/', 'https://server.example')).toBe('https://cdn.example/api/v1/attachments/files/b/preview/');
  expect(normalizeAttachmentUrl('https://server.example/api/v1/attachments/files/b/download/?key=1', 'https://server.example')).toBe('https://server.example/api/v1/attachments/files/b/download?key=1');
  expect(record.attachments[0].url).toBe('/api/v1/attachments/files/a/preview');
  expect(record.attachments[1].url).toBe('https://cdn.example/api/v1/attachments/files/b/preview/');
});
