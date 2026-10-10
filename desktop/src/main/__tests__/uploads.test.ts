import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SubmissionSession, UploadItem } from '../../shared/ipc-types';
const state = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  session: { scope: 'server/user-a', generation: 1 } as SubmissionSession,
  send: vi.fn(), fetch: vi.fn(), mkdir: vi.fn(), write: vi.fn(), read: vi.fn(), unlink: vi.fn(),
}));
vi.mock('electron', () => ({ app: { getPath: () => '/test-user-data' }, BrowserWindow: { getAllWindows: () => [{ webContents: { send: state.send } }] } }));
vi.mock('node:fs/promises', () => ({ mkdir: state.mkdir, writeFile: state.write, readFile: state.read, unlink: state.unlink }));
vi.mock('../store', () => ({ store: {
  get: (key: string) => state.data[key],
  set: (key: string, value: unknown) => { state.data[key] = structuredClone(value); },
} }));
vi.mock('../auth', () => ({ getSubmissionSession: () => state.session, authenticatedFetch: state.fetch }));
const id = '12345678-1234-1234-1234-123456789abc';
const item: UploadItem = { id, name: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 3, type: 'image', status: 'queued' };
function seed(items: UploadItem[] = [item]) { state.data['compose.uploads'] = { [state.session.scope]: items, other: [{ ...item, name: 'other-user.jpg' }] }; }
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  state.data = {}; state.session = { scope: 'server/user-a', generation: 1 };
  state.mkdir.mockResolvedValue(undefined); state.write.mockResolvedValue(undefined);
  state.read.mockResolvedValue(Buffer.from([1, 2, 3])); state.unlink.mockResolvedValue(undefined);
  state.fetch.mockResolvedValue(new Response(JSON.stringify({ uid: 'uploaded-file' })));
});
afterEach(() => vi.restoreAllMocks());

it('stages a private upload in a hashed account directory and broadcasts completion', async () => {
  const api = await import('../uploads');
  const staged = await api.stageUpload(state.session, { name: 'photo.jpg', mimeType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) });
  await vi.waitFor(() => expect(api.listUploads(state.session)[0].status).toBe('uploaded'));
  expect(state.write.mock.calls[0][0]).toMatch(/draft-files[\\/][a-f0-9]{64}[\\/][a-f0-9-]{36}$/);
  expect(staged.type).toBe('image');
  const [url, init, generation] = state.fetch.mock.calls[0];
  expect(url).toBe('/api/v1/attachments/files');
  expect(init.body.get('is_public')).toBe('false');
  expect(generation).toBe(1);
  expect(state.send).toHaveBeenCalledWith('uploads:changed', state.session.scope);
});

it('rejects empty uploads before any file or network write', async () => {
  const api = await import('../uploads');
  await expect(api.stageUpload(state.session, { name: '', mimeType: '', bytes: new Uint8Array() })).rejects.toThrow('文件为空');
  expect(state.write).not.toHaveBeenCalled(); expect(state.fetch).not.toHaveBeenCalled();
});

it('cleans up the staged copy if account switches during disk write', async () => {
  const api = await import('../uploads'); const old = { ...state.session };
  state.write.mockImplementation(async () => { state.session = { ...old, generation: 2 }; });
  await expect(api.stageUpload(old, { name: 'a.txt', mimeType: 'text/plain', bytes: new Uint8Array([1]) })).rejects.toThrow('切换');
  expect(state.unlink).toHaveBeenCalledWith(state.write.mock.calls[0][0]);
  expect(state.fetch).not.toHaveBeenCalled();
});

it('recognizes interrupted uploads after restart without changing another account', async () => {
  seed([{ ...item, status: 'uploading' }]);
  const api = await import('../uploads');
  expect(api.listUploads(state.session)[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('中断') });
  expect((state.data['compose.uploads'] as Record<string, UploadItem[]>).other[0].name).toBe('other-user.jpg');
});

it.each([413, 400, 500])('keeps a failed HTTP %s upload retryable', async (status) => {
  seed(); const api = await import('../uploads');
  state.fetch.mockResolvedValueOnce(new Response(JSON.stringify(status === 400 ? { file: ['invalid mime'] } : {}), { status }));
  await api.retryUpload(state.session, id);
  expect(api.listUploads(state.session)[0]).toMatchObject({ status: 'failed', error: expect.any(String) });
  await api.retryUpload(state.session, id);
  expect(api.listUploads(state.session)[0]).toMatchObject({ status: 'uploaded', uid: 'uploaded-file' });
});

it('rejects success responses missing the attachment identifier', async () => {
  seed(); const api = await import('../uploads');
  state.fetch.mockResolvedValue(new Response('{}'));
  await api.retryUpload(state.session, id);
  expect(api.listUploads(state.session)[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('编号') });
});

it('guards duplicate retry and prevents removing a running upload', async () => {
  seed(); const api = await import('../uploads');
  let finish!: (response: Response) => void;
  state.fetch.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  const running = api.retryUpload(state.session, id);
  await vi.waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1));
  await api.retryUpload(state.session, id);
  await expect(api.removeUpload(state.session, id)).rejects.toThrow('等待');
  await expect(api.clearUploads(state.session)).rejects.toThrow('仍在上传');
  finish(new Response(JSON.stringify({ id: 'done' }))); await running;
  expect(state.fetch).toHaveBeenCalledTimes(1);
});

it('ignores missing or already uploaded entries', async () => {
  seed([{ ...item, status: 'uploaded', uid: 'done' }]); const api = await import('../uploads');
  await api.retryUpload(state.session, id); await api.retryUpload(state.session, 'missing');
  expect(state.fetch).not.toHaveBeenCalled();
});

it('preserves other accounts on removal and tolerates a missing local copy', async () => {
  seed(); const api = await import('../uploads'); state.unlink.mockRejectedValue(new Error('missing'));
  await api.removeUpload(state.session, id);
  expect(api.listUploads(state.session)).toEqual([]);
  expect((state.data['compose.uploads'] as Record<string, UploadItem[]>).other).toHaveLength(1);
});

it('clears all copies for the current account', async () => {
  seed(); const api = await import('../uploads');
  await api.clearUploads(state.session);
  expect(api.listUploads(state.session)).toEqual([]);
  expect(state.unlink).toHaveBeenCalledTimes(1);
});

it('previews local bytes without network access', async () => {
  seed(); const api = await import('../uploads');
  expect(await api.previewUpload(state.session, id)).toEqual({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' });
  expect(state.fetch).not.toHaveBeenCalled();
});

it('falls back to the remote preview when the local copy is unavailable', async () => {
  seed([{ ...item, uid: 'remote/file' }]); const api = await import('../uploads');
  state.read.mockRejectedValue(new Error('missing'));
  state.fetch.mockResolvedValue(new Response(new Uint8Array([4, 5]), { headers: { 'content-type': 'image/png' } }));
  expect(await api.previewUpload(state.session, id)).toEqual({ bytes: new Uint8Array([4, 5]), mimeType: 'image/png' });
  expect(state.fetch.mock.calls[0][0]).toContain('remote%2Ffile');
});

it('surfaces remote preview failures and missing attachments', async () => {
  seed([{ ...item, uid: 'remote' }]); const api = await import('../uploads');
  state.read.mockRejectedValue(new Error('missing')); state.fetch.mockResolvedValue(new Response('', { status: 404 }));
  await expect(api.previewUpload(state.session, id)).rejects.toThrow('无法加载');
  await expect(api.previewUpload(state.session, 'missing')).rejects.toThrow('不存在');
});

it('refuses old sessions before disk or network operations', async () => {
  seed(); const api = await import('../uploads'); const old = { ...state.session };
  state.session = { ...old, generation: 2 };
  expect(() => api.listUploads(old)).toThrow('切换');
  await expect(api.previewUpload(old, id)).rejects.toThrow('切换');
  await expect(api.retryUpload(old, id)).rejects.toThrow('切换');
  expect(state.read).not.toHaveBeenCalled(); expect(state.fetch).not.toHaveBeenCalled();
});

it('rejects invalid attachment IDs before deleting any file', async () => {
  const api = await import('../uploads');
  await expect(api.removeUpload(state.session, '../outside')).rejects.toThrow('无效附件');
  expect(state.unlink).not.toHaveBeenCalled();
});
