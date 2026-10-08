jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('../../src/store/hooks', () => ({ useAppDispatch: jest.fn(), useAppSelector: jest.fn() }));
jest.mock('../../src/store/slices/bbtalkSlice', () => ({
  optimisticDelete: jest.fn(payload => ({ type: 'delete', payload })), undoDelete: jest.fn(payload => ({ type: 'undo', payload })),
  updateBBTalkAsync: jest.fn(payload => ({ type: 'update', payload })), togglePinAsync: jest.fn(payload => ({ type: 'pin', payload })),
  createBBTalkAsync: jest.fn(payload => ({ type: 'create', payload })),
}));
jest.mock('../../src/services/api/bbtalkApi', () => ({ bbtalkApi: { deleteBBTalk: jest.fn() } }));
jest.mock('../../src/services/api/mediaApi', () => ({ attachmentApi: { upload: jest.fn(), uploadFile: jest.fn() } }));
jest.mock('../../src/services/shareService', () => ({ shareBBTalk: jest.fn() }));
jest.mock('../../src/utils/errorHandler', () => ({ logError: jest.fn() }));
jest.mock('../../src/utils/crossAlert', () => ({ xActionSheet: jest.fn(), xConfirm: jest.fn() }));
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAppDispatch, useAppSelector } from '../../src/store/hooks';
import { createBBTalkAsync, updateBBTalkAsync, undoDelete, togglePinAsync } from '../../src/store/slices/bbtalkSlice';
import { bbtalkApi } from '../../src/services/api/bbtalkApi';
import { attachmentApi } from '../../src/services/api/mediaApi';
import { shareBBTalk } from '../../src/services/shareService';
import { logError } from '../../src/utils/errorHandler';
import { xActionSheet, xConfirm } from '../../src/utils/crossAlert';
import { setSession, clearSession } from '../../src/services/session';
import { useBBTalkActions } from '../../src/hooks/useBBTalkActions';
import type { BBTalk } from '../../src/types';
const first = { id: 'first', content: 'first content', visibility: 'private', isPinned: false } as BBTalk;
const second = { ...first, id: 'second' };
const dispatch = jest.fn(), unwrap = jest.fn(), showError = jest.fn(), navigate = jest.fn();
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); setSession('https://example.com', 'alice');
  unwrap.mockReset().mockResolvedValue(undefined);
  dispatch.mockReset().mockReturnValue({ unwrap });
  (useAppDispatch as jest.Mock).mockReturnValue(dispatch);
  (useAppSelector as jest.Mock).mockReturnValue({ bbtalks: [first, second] });
  (bbtalkApi.deleteBBTalk as jest.Mock).mockReset().mockResolvedValue(undefined);
  (attachmentApi.upload as jest.Mock).mockReset().mockResolvedValue({ uid: 'audio' });
  (shareBBTalk as jest.Mock).mockReset().mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); jest.clearAllTimers(); jest.useRealTimers(); });
const actions = () => renderHook(() => useBBTalkActions({ showError, onNavigateCompose: navigate }));
it('allows undo before deletion reaches the server', async () => {
  const { result } = actions();
  act(() => result.current.handleDelete(first));
  expect(result.current.pendingDelete?.bbtalk.id).toBe('first');
  act(() => result.current.handleUndo());
  await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
  expect(bbtalkApi.deleteBBTalk).not.toHaveBeenCalled();
  expect(undoDelete).toHaveBeenCalledWith({ bbtalk: first, index: 0 });
  expect(result.current.pendingDelete).toBeNull();
});
it('rolls back deletion at the original position when the server rejects it', async () => {
  (bbtalkApi.deleteBBTalk as jest.Mock).mockRejectedValue(new Error('offline'));
  const { result } = actions(); act(() => result.current.handleDelete(second));
  await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
  expect(undoDelete).toHaveBeenCalledWith({ bbtalk: second, index: 1 });
  expect(showError).toHaveBeenCalledWith('删除失败', 'offline');
});
it('does not let an older delete completion dismiss a newer undo opportunity', async () => {
  const { result } = actions(); act(() => result.current.handleDelete(first));
  await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
  act(() => result.current.handleDelete(second));
  await act(async () => { await jest.advanceTimersByTimeAsync(2000); });
  expect(result.current.pendingDelete?.bbtalk.id).toBe('second');
  act(() => result.current.handleUndo());
  await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
  expect(bbtalkApi.deleteBBTalk).toHaveBeenCalledTimes(1);
  expect(undoDelete).toHaveBeenCalledWith({ bbtalk: second, index: 1 });
});
it('does not delete records absent from the list or from an old account', async () => {
  const { result } = actions(); act(() => result.current.handleDelete({ ...first, id: 'missing' }));
  clearSession(); act(() => result.current.handleDelete(first));
  await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
  expect(dispatch).not.toHaveBeenCalled(); expect(bbtalkApi.deleteBBTalk).not.toHaveBeenCalled();
});
it('does not send a pending deletion after an account switch', async () => {
  const { result } = actions(); act(() => result.current.handleDelete(first)); clearSession();
  await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
  expect(bbtalkApi.deleteBBTalk).not.toHaveBeenCalled();
});
it.each([0, 1, 2, 3, 4])('dispatches menu operation %s through the actual hook', async index => {
  const { result } = actions(); act(() => result.current.showMenu(first));
  await act(async () => { (xActionSheet as jest.Mock).mock.calls[0][2](index); });
  if (index === 0) expect(navigate).toHaveBeenCalledWith(first);
  if (index === 1) expect(togglePinAsync).toHaveBeenCalledWith(first.id);
  if (index === 2) expect(shareBBTalk).toHaveBeenCalledWith(first);
  if (index === 3) expect(Clipboard.setStringAsync).toHaveBeenCalledWith(first.content);
  if (index === 4) expect(result.current.pendingDelete?.bbtalk).toEqual(first);
});
it('keeps public/private visibility unchanged until confirmation and reports failed updates', async () => {
  const { result } = actions(); act(() => result.current.toggleVisibility(first));
  expect(updateBBTalkAsync).not.toHaveBeenCalled();
  unwrap.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { (xConfirm as jest.Mock).mock.calls[0][2](); });
  expect(updateBBTalkAsync).toHaveBeenCalledWith({ id: first.id, data: { visibility: 'public' } });
  expect(showError).toHaveBeenCalledWith('修改失败', expect.any(String));
  act(() => result.current.toggleVisibility({ ...first, visibility: 'public' }));
  await act(async () => { (xConfirm as jest.Mock).mock.calls[1][2](); });
  expect(updateBBTalkAsync).toHaveBeenLastCalledWith({ id: first.id, data: { visibility: 'private' } });
});
it('shares once while busy and recovers after a failed share', async () => {
  const { result } = actions();
  (shareBBTalk as jest.Mock).mockRejectedValueOnce(new Error('share unavailable'));
  act(() => result.current.showMenu(first));
  await act(async () => { (xActionSheet as jest.Mock).mock.calls[0][2](2); });
  expect(result.current.isSharing).toBe(false); expect(logError).toHaveBeenCalled();
});
it('creates a private voice record using the uploaded attachment', async () => {
  const { result } = actions();
  await act(async () => { await result.current.handleVoiceFinish({ text: '', audioUri: 'file:///voice.m4a', audioDuration: 2 }); });
  expect(attachmentApi.upload).toHaveBeenCalledWith('file:///voice.m4a', expect.stringMatching(/\.m4a$/), 'audio/mp4');
  expect(createBBTalkAsync).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'private', attachments: [{ uid: 'audio' }] }));
});
it('surfaces rejected Redux voice submissions instead of silently reporting completion', async () => {
  unwrap.mockRejectedValueOnce(new Error('save failed'));
  const { result } = actions();
  await act(async () => { await result.current.handleVoiceFinish({ text: 'voice transcript', audioUri: null, audioDuration: 0 }); });
  expect(showError).toHaveBeenCalledWith('保存失败', 'save failed');
});
it('does not save an empty voice result or one completed after account switch', async () => {
  const { result } = actions();
  await act(async () => { await result.current.handleVoiceFinish({ text: '', audioUri: null, audioDuration: 0 }); });
  (attachmentApi.upload as jest.Mock).mockImplementation(async () => { clearSession(); return { uid: 'audio' }; });
  await act(async () => { await result.current.handleVoiceFinish({ text: 'text', audioUri: 'file:///voice', audioDuration: 2 }); });
  expect(createBBTalkAsync).not.toHaveBeenCalled();
});
it('ignores a voice result submitted after the session is gone', async () => {
  const { result } = actions();
  clearSession();
  await act(async () => { await result.current.handleVoiceFinish({ text: 'late', audioUri: null, audioDuration: 0 }); });
  expect(attachmentApi.upload).not.toHaveBeenCalled();
  expect(createBBTalkAsync).not.toHaveBeenCalled();
});
it.each(['', 'audio/webm'])('wraps a browser voice blob (type %j) into a webm upload on web', async blobType => {
  (Platform as any).OS = 'web';
  const originalFetch = global.fetch;
  const fetchMock = jest.fn().mockResolvedValue({ blob: async () => new Blob(['audio'], { type: blobType }) });
  global.fetch = fetchMock as unknown as typeof fetch;
  (attachmentApi.uploadFile as jest.Mock).mockReset().mockResolvedValueOnce({ uid: 'web-audio' });
  try {
    const { result } = actions();
    await act(async () => { await result.current.handleVoiceFinish({ text: '', audioUri: 'blob:voice', audioDuration: 3 }); });
    expect(fetchMock).toHaveBeenCalledWith('blob:voice');
    const file = (attachmentApi.uploadFile as jest.Mock).mock.calls[0][0];
    expect(file).toBeInstanceOf(File);
    expect(file.name).toMatch(/^voice_\d+\.webm$/);
    expect(file.type).toBe('audio/webm');
    expect(createBBTalkAsync).toHaveBeenCalledWith(expect.objectContaining({ attachments: [{ uid: 'web-audio' }] }));
  } finally {
    global.fetch = originalFetch;
    (Platform as any).OS = 'ios';
  }
});
it('uploads android voice recordings as 3gpp attachments', async () => {
  (Platform as any).OS = 'android';
  try {
    const { result } = actions();
    await act(async () => { await result.current.handleVoiceFinish({ text: 'note', audioUri: 'file:///voice', audioDuration: 1 }); });
    expect(attachmentApi.upload).toHaveBeenCalledWith('file:///voice', expect.stringMatching(/^voice_\d+\.3gp$/), 'audio/3gpp');
    expect(createBBTalkAsync).toHaveBeenCalledWith(expect.objectContaining({ content: 'note' }));
  } finally { (Platform as any).OS = 'ios'; }
});
it('swallows a voice save failure that surfaces after an account switch', async () => {
  unwrap.mockImplementationOnce(async () => { clearSession(); throw new Error('save failed'); });
  const { result } = actions();
  await act(async () => { await result.current.handleVoiceFinish({ text: 'x', audioUri: null, audioDuration: 0 }); });
  expect(showError).not.toHaveBeenCalled();
});
it('ignores concurrent share requests while a share is still in flight', async () => {
  let release!: () => void;
  (shareBBTalk as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const { result } = actions();
  act(() => result.current.showMenu(first));
  await act(async () => { (xActionSheet as jest.Mock).mock.calls[0][2](2); });
  expect(result.current.isSharing).toBe(true);
  act(() => result.current.showMenu(first));
  await act(async () => { (xActionSheet as jest.Mock).mock.calls[1][2](2); });
  expect(shareBBTalk).toHaveBeenCalledTimes(1);
  await act(async () => { release(); });
  expect(result.current.isSharing).toBe(false);
});
it('abandons the rollback when the account switches during a failing delete', async () => {
  (bbtalkApi.deleteBBTalk as jest.Mock).mockImplementationOnce(async () => { clearSession(); throw new Error('offline'); });
  const { result } = actions();
  act(() => result.current.handleDelete(first));
  await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
  expect(undoDelete).not.toHaveBeenCalled();
  expect(showError).not.toHaveBeenCalled();
});
it('undo stays a no-op without a pending deletion or after an account switch', () => {
  const { result } = actions();
  act(() => result.current.handleUndo());
  expect(dispatch).not.toHaveBeenCalled();
  act(() => result.current.handleDelete(first));
  clearSession();
  act(() => result.current.handleUndo());
  expect(undoDelete).not.toHaveBeenCalled();
  expect(result.current.pendingDelete?.bbtalk.id).toBe('first');
});
it('offers unpinning for an already pinned record', () => {
  const { result } = actions();
  act(() => result.current.showMenu({ ...first, isPinned: true }));
  const options = (xActionSheet as jest.Mock).mock.calls[0][1];
  expect(options[1].text).toBe('取消置顶');
});
it('ignores menu actions chosen after an account switch', async () => {
  const { result } = actions();
  act(() => result.current.showMenu(first));
  clearSession();
  await act(async () => { (xActionSheet as jest.Mock).mock.calls[0][2](0); });
  expect(navigate).not.toHaveBeenCalled();
  expect(togglePinAsync).not.toHaveBeenCalled();
});
it('drops a visibility change confirmed after an account switch', async () => {
  const { result } = actions();
  act(() => result.current.toggleVisibility(first));
  clearSession();
  await act(async () => { (xConfirm as jest.Mock).mock.calls[0][2](); });
  expect(updateBBTalkAsync).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});
