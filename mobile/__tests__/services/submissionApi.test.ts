import { bbtalkApi } from '../../src/services/api/bbtalkApi';
import { apiClient } from '../../src/services/api/apiClient';
jest.mock('../../src/services/api/apiClient', () => ({ apiClient: { post: jest.fn(), patch: jest.fn(), get: jest.fn() } }));
jest.mock('../../src/config', () => ({ getApiBaseUrl: () => 'https://test.invalid' }));
const record = { uid: 'record', content: 'original', update_time: '2026-09-07T00:00:00Z' };

beforeEach(() => jest.clearAllMocks());

it('replays the same wire payload and header including attachment metadata', async () => {
  const input = {
    submissionKey: 'mobile_saved_key', content: 'original', tags: ['one'], visibility: 'private' as const,
    attachments: [{ uid: 'attachment', url: '/file', type: 'file' as const, filename: 'file.txt', fileSize: 9 }],
  };
  (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('response lost')).mockResolvedValue(record);
  await expect(bbtalkApi.createBBTalk(input)).rejects.toThrow('response lost');
  expect((await bbtalkApi.createBBTalk(JSON.parse(JSON.stringify(input)))).id).toBe('record');
  const calls = (apiClient.post as jest.Mock).mock.calls;
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[1][2]).toEqual({ 'Idempotency-Key': 'mobile_saved_key' });
  expect(calls[1][1].attachments[0]).toMatchObject({ uid: 'attachment', file_size: 9 });
  expect(calls[1][1]).not.toHaveProperty('submissionKey');
});

it('sends the reviewed edit version and exposes status lookup without posting', async () => {
  (apiClient.patch as jest.Mock).mockResolvedValue(record);
  (apiClient.get as jest.Mock).mockResolvedValue(record);
  await bbtalkApi.updateBBTalk('record', { content: 'mine', attachments: [] }, record.update_time);
  expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/bbtalk/record/', { content: 'mine', attachments: [] }, { 'If-Match': record.update_time });
  expect((await bbtalkApi.submissionStatus('saved_key')).id).toBe('record');
  expect(apiClient.get).toHaveBeenCalledWith('/api/v1/bbtalk/submission-status/', { key: 'saved_key' });
  expect(apiClient.post).not.toHaveBeenCalled();
});
