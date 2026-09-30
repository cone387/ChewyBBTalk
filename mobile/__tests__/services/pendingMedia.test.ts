jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/', makeDirectoryAsync: jest.fn(), copyAsync: jest.fn(),
  readDirectoryAsync: jest.fn(), deleteAsync: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({ getAllKeys: jest.fn(), multiGet: jest.fn(), multiRemove: jest.fn() }));
jest.mock('../../src/services/drafts', () => ({ waitForDraftWrites: jest.fn() }));
jest.mock('../../src/services/api/mediaApi', () => ({ attachmentApi: { upload: jest.fn(), uploadFile: jest.fn() } }));
import { Platform } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { attachmentApi } from '../../src/services/api/mediaApi';
import { waitForDraftWrites } from '../../src/services/drafts';
import { getSession, setSession, clearSession } from '../../src/services/session';
import { retainMedia, uploadRetainedMedia, pruneRetainedMedia, removeAccountDrafts } from '../../src/services/pendingMedia';
const originalFetch = global.fetch;
const originalReader = (global as any).FileReader;
afterEach(() => { global.fetch = originalFetch; (global as any).FileReader = originalReader; });

beforeEach(() => {
  jest.resetAllMocks(); (Platform as any).OS = 'ios';
  setSession('https://example.com', 'alice');
  (FS.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
  (FS.copyAsync as jest.Mock).mockResolvedValue(undefined);
  (FS.deleteAsync as jest.Mock).mockResolvedValue(undefined);
  (FS.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
  (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);
  (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([]);
  (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);
});

it('copies native media into an account-specific directory with a sanitized extension', async () => {
  const session = getSession();
  const item = await retainMedia('file:///temporary/photo', 'photo.jp/g', 'image/jpeg', session);
  expect(item.uri).toContain(`draft-media/${encodeURIComponent(session.scope!)}/`);
  expect(item.uri).toMatch(/\.jpg$/);
  expect(FS.copyAsync).toHaveBeenCalledWith({ from: 'file:///temporary/photo', to: item.uri });
  expect(item.name).toBe('photo.jp/g');
});

it('uses a safe binary extension when the input has no usable suffix', async () => {
  expect((await retainMedia('file:///temporary/file', 'photo.', 'application/octet-stream', getSession())).uri).toMatch(/\.bin$/);
});

it('refuses retention without a current signed-in session', async () => {
  const old = getSession(); clearSession();
  await expect(retainMedia('file:///temporary/file', 'a.jpg', 'image/jpeg', old)).rejects.toThrow('重新登录');
  await expect(retainMedia('file:///temporary/file', 'a.jpg', 'image/jpeg', getSession())).rejects.toThrow('重新登录');
  expect(FS.copyAsync).not.toHaveBeenCalled();
});

it('does not return a retained attachment after the account changes during copying', async () => {
  const old = getSession();
  (FS.copyAsync as jest.Mock).mockImplementation(async () => { clearSession(); });
  await expect(retainMedia('file:///temporary/file', 'a.jpg', 'image/jpeg', old)).rejects.toThrow('账号已切换');
});

it('surfaces local copy failures rather than reporting an attachment as retained', async () => {
  (FS.copyAsync as jest.Mock).mockRejectedValue(new Error('disk full'));
  await expect(retainMedia('file:///temporary/file', 'a.jpg', 'image/jpeg', getSession())).rejects.toThrow('disk full');
});

it('uploads the retained native copy and returns the server attachment', async () => {
  (attachmentApi.upload as jest.Mock).mockResolvedValue({ uid: 'server-file' });
  const item = { id: '1', uri: 'file:///retained.jpg', name: 'a.jpg', mime: 'image/jpeg' };
  expect(await uploadRetainedMedia(item, getSession())).toEqual({ uid: 'server-file' });
  expect(attachmentApi.upload).toHaveBeenCalledWith(item.uri, item.name, item.mime);
});

it('does not upload media from an old session', async () => {
  const old = getSession(); clearSession();
  await expect(uploadRetainedMedia({ id: '1', uri: 'file:///a', name: 'a', mime: '' }, old)).rejects.toThrow('账号已切换');
  expect(attachmentApi.upload).not.toHaveBeenCalled();
});

it('prunes only owned, old, unreferenced copies and preserves fresh, referenced and foreign files', async () => {
  const session = getSession();
  const old = `${Date.now() - 90000000}_abc.jpg`;
  const referenced = `${Date.now() - 90000001}_def.jpg`;
  const fresh = `${Date.now()}_new.jpg`;
  (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([`compose_draft:${session.scope}:new`, 'other-key']);
  (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([['draft', JSON.stringify({ uri: referenced })]]);
  (FS.readDirectoryAsync as jest.Mock).mockResolvedValue([old, referenced, fresh, 'voice_pending.m4a', '../foreign.jpg']);
  await pruneRetainedMedia(session);
  expect(AsyncStorage.multiGet).toHaveBeenCalledWith([`compose_draft:${session.scope}:new`]);
  expect(FS.deleteAsync).toHaveBeenCalledTimes(1);
  expect(FS.deleteAsync).toHaveBeenCalledWith(expect.stringContaining(old), { idempotent: true });
});

it('stops pruning when session changes while enumerating files', async () => {
  const session = getSession();
  (FS.readDirectoryAsync as jest.Mock).mockImplementation(async () => { clearSession(); return ['1_abc.jpg']; });
  await pruneRetainedMedia(session);
  expect(FS.deleteAsync).not.toHaveBeenCalled();
});

it('treats missing cleanup directories as non-blocking', async () => {
  (FS.readDirectoryAsync as jest.Mock).mockRejectedValue(new Error('not found'));
  await expect(pruneRetainedMedia(getSession())).resolves.toBeUndefined();
});

it('waits for pending writes before deleting only the deleted account drafts', async () => {
  const scope = getSession().scope!;
  const key = `compose_draft:${scope}:new`;
  (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([key, 'compose_draft:other:new']);
  await removeAccountDrafts(scope);
  expect(waitForDraftWrites).toHaveBeenCalledWith(scope);
  expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([key]);
  expect(FS.deleteAsync).toHaveBeenCalledWith(`file:///documents/draft-media/${encodeURIComponent(scope)}/`, { idempotent: true });
  expect((waitForDraftWrites as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((AsyncStorage.multiRemove as jest.Mock).mock.invocationCallOrder[0]);
});

it('does not touch native files for web cleanup or an absent account', async () => {
  (Platform as any).OS = 'web';
  await pruneRetainedMedia(getSession());
  await removeAccountDrafts(null);
  expect(AsyncStorage.getAllKeys).not.toHaveBeenCalled();
  await removeAccountDrafts(getSession().scope);
  expect(FS.deleteAsync).not.toHaveBeenCalled();
});

it('retains web blobs as a data URI so they survive browser object URL expiration', async () => {
  (Platform as any).OS = 'web';
  global.fetch = jest.fn().mockResolvedValue({ blob: async () => new Blob(['file']) });
  (global as any).FileReader = jest.fn(() => ({
    result: 'data:image/jpeg;base64,retained', onload: undefined as (() => void) | undefined,
    readAsDataURL() { this.onload?.(); },
  }));
  expect((await retainMedia('blob:temporary', 'photo.jpg', 'image/jpeg', getSession())).uri).toBe('data:image/jpeg;base64,retained');
  expect(FS.copyAsync).not.toHaveBeenCalled();
});

it('rejects web draft blobs above the supported size before reading them', async () => {
  (Platform as any).OS = 'web';
  global.fetch = jest.fn().mockResolvedValue({ blob: async () => ({ size: 8 * 1024 * 1024 + 1 }) });
  (global as any).FileReader = jest.fn();
  await expect(retainMedia('blob:large', 'large.jpg', 'image/jpeg', getSession())).rejects.toThrow('8MB');
  expect((global as any).FileReader).not.toHaveBeenCalled();
});

it('reports web file reader errors without returning an unusable attachment', async () => {
  (Platform as any).OS = 'web';
  global.fetch = jest.fn().mockResolvedValue({ blob: async () => new Blob(['file']) });
  (global as any).FileReader = jest.fn(() => ({ onerror: undefined as (() => void) | undefined, readAsDataURL() { this.onerror?.(); } }));
  await expect(retainMedia('blob:failed', 'photo.jpg', 'image/jpeg', getSession())).rejects.toThrow('无法保留');
});

it('uploads retained web data as a File with its original name and MIME type', async () => {
  (Platform as any).OS = 'web';
  global.fetch = jest.fn().mockResolvedValue({ blob: async () => new Blob(['file']) });
  (attachmentApi.uploadFile as jest.Mock).mockResolvedValue({ uid: 'web-upload' });
  expect(await uploadRetainedMedia({ id: 'id', uri: 'data:retained', name: 'photo.jpg', mime: 'image/jpeg' }, getSession())).toEqual({ uid: 'web-upload' });
  const file = (attachmentApi.uploadFile as jest.Mock).mock.calls[0][0];
  expect(file.name).toBe('photo.jpg'); expect(file.type).toBe('image/jpeg');
});

it('does not upload a retained web draft after account changes during blob loading', async () => {
  (Platform as any).OS = 'web';
  const old = getSession();
  global.fetch = jest.fn().mockResolvedValue({ blob: async () => { clearSession(); return new Blob(['file']); } });
  await expect(uploadRetainedMedia({ id: 'id', uri: 'data:retained', name: 'photo.jpg', mime: 'image/jpeg' }, old)).rejects.toThrow('账号已切换');
  expect(attachmentApi.uploadFile).not.toHaveBeenCalled();
});
