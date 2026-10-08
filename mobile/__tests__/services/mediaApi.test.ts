jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('../../src/services/auth', () => ({ getAccessToken: jest.fn() }));
jest.mock('../../src/config', () => ({ getApiBaseUrl: jest.fn() }));
import { Platform } from 'react-native';
import { getAccessToken } from '../../src/services/auth';
import { getApiBaseUrl } from '../../src/config';
import { setSession, clearSession } from '../../src/services/session';
import { attachmentApi } from '../../src/services/api/mediaApi';
const originalFetch = global.fetch, originalForm = global.FormData;
const fetchMock = jest.fn();
class UploadForm {
  entries = new Map<string, unknown>();
  filenames = new Map<string, unknown>();
  append(key: string, value: unknown, filename?: unknown) { this.entries.set(key, value); this.filenames.set(key, filename); }
  get(key: string) { return this.entries.get(key); }
}
function response(data: unknown = { uid: 'file', preview_url: '/preview/', mime_type: 'image/jpeg' }, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: jest.fn().mockResolvedValue(data) };
}
beforeEach(() => {
  jest.useFakeTimers(); jest.resetAllMocks(); (Platform as any).OS = 'ios';
  global.fetch = fetchMock; global.FormData = UploadForm as unknown as typeof FormData;
  setSession('https://example.com', 'alice');
  (getAccessToken as jest.Mock).mockResolvedValue('access');
  (getApiBaseUrl as jest.Mock).mockReturnValue('https://example.com');
  fetchMock.mockResolvedValue(response());
});
afterEach(() => { global.fetch = originalFetch; global.FormData = originalForm; jest.useRealTimers(); });
it('sends the native file descriptor and bearer token as multipart without JSON headers', async () => {
  expect(await attachmentApi.upload('file:///photo.jpg', 'photo.jpg', 'image/jpeg')).toMatchObject({ uid: 'file', url: 'https://example.com/preview/', type: 'image' });
  const options = fetchMock.mock.calls[0][1];
  expect(options.body.get('file')).toEqual({ uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' });
  expect(options.headers).toEqual({ Authorization: 'Bearer access' });
  expect(jest.getTimerCount()).toBe(0);
});
it('omits the Authorization header entirely when no token is available', async () => {
  (getAccessToken as jest.Mock).mockResolvedValueOnce(null);
  await attachmentApi.upload('file:///photo.jpg', 'photo.jpg', 'image/jpeg');
  expect(fetchMock.mock.calls[0][1].headers).toEqual({});
});
it.each([{ detail: 'denied' }, {}])('surfaces a rejected native upload payload %j', async data => {
  fetchMock.mockResolvedValue(response(data, 400));
  await expect(attachmentApi.upload('file:///photo.jpg', 'photo.jpg', 'image/jpeg'))
    .rejects.toThrow(Object.keys(data).length ? 'denied' : '{}');
});
it('falls back to a placeholder uid when the server response identifies no file', async () => {
  fetchMock.mockResolvedValue(response({ preview_url: '/preview/', mime_type: 'image/jpeg' }));
  expect(await attachmentApi.uploadFile(new File(['file'], 'file'))).toMatchObject({ uid: '', url: 'https://example.com/preview/' });
});
it('names a nameless upload explicitly', async () => {
  await attachmentApi.uploadFile(new File(['file'], ''));
  const options = fetchMock.mock.calls[0][1];
  expect(options.body.get('file')).toBeInstanceOf(File);
  expect(options.body.filenames.get('file')).toBe('upload');
});
it.each(['image/jpeg', 'video/mp4', 'audio/mp4', 'application/pdf'])('infers the attachment kind from %s', async mime => {
  fetchMock.mockResolvedValue(response({ id: 'id', mime_type: mime, original_name: 'original', size: 5, url: '/url' }));
  const attachment = await attachmentApi.uploadFile(new File(['file'], 'file'));
  expect(attachment.type).toBe(mime.startsWith('application') ? 'file' : mime.split('/')[0]);
  expect(attachment).toMatchObject({ uid: 'id', filename: 'original', originalFilename: 'original', fileSize: 5 });
});
it.each([
  ['http://localhost:8000/preview/', 'https://example.com/preview/'],
  ['/preview/', 'https://example.com/preview/'], ['bare/storage/path', ''], ['', ''],
])('normalizes returned preview %s to the configured server', async (url, expected) => {
  fetchMock.mockResolvedValue(response({ uid: 'file', preview_url: url, type: 'video' }));
  expect((await attachmentApi.uploadFile(new File(['file'], 'file'))).url).toBe(expected);
});
it.each([{ detail: 'denied' }, { file: ['bad type', 'too large'] }, { error: 123 }, {}])('surfaces uploadFile error payload %j', async data => {
  fetchMock.mockResolvedValue(response(data, 400));
  await expect(attachmentApi.uploadFile(new File(['file'], 'file'))).rejects.toThrow(Object.keys(data).length ? /denied|bad type; too large|123/ : '上传失败');
});
it('keeps HTTP errors with non-JSON bodies retryable', async () => {
  const res = response({}, 502); res.json.mockRejectedValue(new Error('html')); fetchMock.mockResolvedValue(res);
  await expect(attachmentApi.uploadFile(new File(['file'], 'file'))).rejects.toThrow('上传失败');
});
it('blocks requests when token loading crosses an account switch', async () => {
  (getAccessToken as jest.Mock).mockImplementation(async () => { clearSession(); return 'old'; });
  await expect(attachmentApi.upload('file:///photo', 'photo.jpg', 'image/jpeg')).rejects.toThrow('账号已切换');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects a successful upload response from a previous account', async () => {
  fetchMock.mockImplementation(async () => { clearSession(); return response(); });
  await expect(attachmentApi.uploadFile(new File(['file'], 'file'))).rejects.toThrow('账号已切换');
});
it('rejects results if account switches during JSON parsing', async () => {
  const res = response(); res.json.mockImplementation(async () => { clearSession(); return { uid: 'old-file' }; }); fetchMock.mockResolvedValue(res);
  await expect(attachmentApi.uploadFile(new File(['file'], 'file'))).rejects.toThrow('账号已切换');
});
it('times out a stalled upload and clears the deadline timer', async () => {
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })))));
  const assertion = expect(attachmentApi.uploadFile(new File(['file'], 'file'))).rejects.toThrow('上传超时');
  await jest.advanceTimersByTimeAsync(60000); await assertion; expect(jest.getTimerCount()).toBe(0);
});
it('converts browser blob URIs to files rather than submitting a native descriptor', async () => {
  (Platform as any).OS = 'web';
  fetchMock.mockResolvedValueOnce({ blob: async () => new Blob(['file'], { type: 'image/jpeg' }) });
  await attachmentApi.upload('blob:photo', 'photo.jpg', '');
  const file = fetchMock.mock.calls[1][1].body.get('file');
  expect(file).toBeInstanceOf(File); expect(file.name).toBe('photo.jpg'); expect(file.type).toBe('image/jpeg');
});
it('does not upload a browser blob into the newly switched account', async () => {
  (Platform as any).OS = 'web';
  fetchMock.mockResolvedValueOnce({ blob: async () => { clearSession(); return new Blob(['file']); } });
  await expect(attachmentApi.upload('blob:photo', 'photo.jpg', '')).rejects.toThrow('账号已切换');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
