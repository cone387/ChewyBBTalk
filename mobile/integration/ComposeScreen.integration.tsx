import * as ImagePicker from 'expo-image-picker';
import { uploadRetainedMedia, retainMedia } from '../src/services/pendingMedia';
import React from 'react';
import { render, fireEvent, waitFor, act, cleanup } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ComposeScreen from '../src/screens/ComposeScreen';
import PrivacyLockOverlay from '../src/components/PrivacyLockOverlay';
import { Animated } from 'react-native';
import { THEMES } from '../src/theme/ThemeContext';
import bbtalkReducer from '../src/store/slices/bbtalkSlice';
import tagReducer from '../src/store/slices/tagSlice';
import { apiClient } from '../src/services/api/apiClient';
import { getSession, setSession, clearSession } from '../src/services/session';
import { readSubmission } from '../src/services/submissions';
import { xConfirm, xActionSheet } from '../src/utils/crossAlert';

const mockNavigation = { goBack: jest.fn(), dispatch: jest.fn(), addListener: jest.fn(() => () => {}) };
let mockParams: any = {};
const mockPreventRemove = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation, useRoute: () => ({ params: mockParams }), usePreventRemove: (...args: any[]) => mockPreventRemove(...args) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/services/api/apiClient', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('../src/config', () => ({ getApiBaseUrl: () => 'https://integration.example' }));
jest.mock('../src/services/api/mediaApi', () => ({ attachmentApi: { upload: jest.fn() } }));
jest.mock('../src/utils/imageSource', () => ({ buildImageSource: () => ({ uri: 'https://integration.example/image' }) }));
jest.mock('../src/utils/crossAlert', () => ({ xAlert: jest.fn(), xConfirm: jest.fn(), xActionSheet: jest.fn() }));
jest.mock('../src/components/VoiceRecordingOverlay', () => () => null);
jest.mock('react-native-markdown-display', () => 'Markdown');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({}), setAudioModeAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('../src/services/pendingMedia', () => ({ retainMedia: jest.fn(), uploadRetainedMedia: jest.fn(), pruneRetainedMedia: jest.fn() }));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-location', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));

const wire = { uid: 'record-1', content: '原始内容', visibility: 'private', tags: [], attachments: [], update_time: '2026-09-07T09:00:00Z' };
function mount(props: React.ComponentProps<typeof ComposeScreen> = {}) {
  const store = configureStore({ reducer: { bbtalk: bbtalkReducer, tag: tagReducer } });
  return { ...render(<Provider store={store}><ComposeScreen {...props} /></Provider>), store };
}
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  clearSession(); setSession('https://integration.example', 'owner');
  mockParams = {};
  (apiClient.get as jest.Mock).mockResolvedValue([]);
  (apiClient.post as jest.Mock).mockReset();
  (apiClient.patch as jest.Mock).mockReset();
});
afterEach(cleanup);

test('real editor restores a pending submission after remount and retries its original payload and key', async () => {
  const attachment = { uid: 'file-1', type: 'file', url: 'https://integration.example/file', filename: 'notes.txt' };
  await AsyncStorage.setItem(`compose_draft:${getSession().scope}`, JSON.stringify({ version: 1, content: '草稿正文', visibility: 'public', attachments: [attachment], location: { latitude: 1, longitude: 2 } }));
  const first = mount();
  // Flush initial AsyncStorage effects outside the query timeout (cold native transforms are slow in CI).
  await act(async () => {});
  expect(first.getByDisplayValue('草稿正文')).toBeTruthy();
  const input = first.getByPlaceholderText('此刻，有什么想记下来的？');
  fireEvent.changeText(input, '#工作 原始内容');
  await act(async () => {});
  (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('response lost'));
  fireEvent.press(first.getByText('发布'));
  await first.findByText(/发布或更新失败/);
  const intent = await readSubmission();
  expect(intent?.payload.content).toBe('原始内容');
  expect(intent?.payload.attachments).toEqual([attachment]);
  expect(intent?.payload.visibility).toBe('public');
  const originalCall = (apiClient.post as jest.Mock).mock.calls[0];
  first.unmount();
  const reopened = mount();
  await reopened.findByText('有一份发布结果待核对');
  fireEvent.changeText(reopened.getByPlaceholderText('此刻，有什么想记下来的？'), '后来输入');
  (apiClient.post as jest.Mock).mockResolvedValueOnce(wire);
  fireEvent.press(reopened.getByText('重试原提交'));
  await reopened.findByText('已确认原提交发布成功，当前输入仍保留。修改后可发布新记录。');
  expect((apiClient.post as jest.Mock).mock.calls[1]).toEqual(originalCall);
  expect(reopened.getByDisplayValue('后来输入')).toBeTruthy();
  expect((await readSubmission())?.state).toBe('confirmed');
  expect(reopened.store.getState().bbtalk.bbtalks).toHaveLength(1);
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
  reopened.unmount();
  const afterRecovery = mount();
  await afterRecovery.findByDisplayValue('后来输入');
  const saved = JSON.parse((await AsyncStorage.getItem(`compose_draft:${getSession().scope}`))!);
  expect(saved).toMatchObject({ content: '后来输入', visibility: 'public', attachments: [attachment], location: { latitude: 1, longitude: 2 } });
});

test('persistent write failure prevents a request and keeps editor input', async () => {
  const screen = mount();
  await act(async () => {});
  fireEvent.changeText(screen.getByPlaceholderText('此刻，有什么想记下来的？'), '不能丢失');
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  fireEvent.press(screen.getByText('保存'));
  await screen.findByText(/发布或更新失败/);
  expect(apiClient.post).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('不能丢失')).toBeTruthy();
});

test('actual edit flow retains input on conflict and only advances the version after explicit review', async () => {
  mockParams = { editItem: { id: 'record-1', content: '旧内容', visibility: 'private', tags: [], attachments: [], updatedAt: wire.update_time } };
  const screen = mount();
  await act(async () => {});
  fireEvent.changeText(screen.getByPlaceholderText('此刻，有什么想记下来的？'), '我的修改');
  (apiClient.patch as jest.Mock).mockRejectedValueOnce({ status: 409, code: 'edit_conflict', current: { ...wire, content: '另一端修改', update_time: '2026-09-07T10:00:00Z' } });
  fireEvent.press(screen.getByText('更新'));
  await waitFor(() => expect(xConfirm).toHaveBeenCalled());
  expect(screen.getByDisplayValue('我的修改')).toBeTruthy();
  expect((xConfirm as jest.Mock).mock.calls[0][1]).toContain('另一端修改');
  expect(apiClient.patch).toHaveBeenCalledTimes(1);
  await act(async () => { (xConfirm as jest.Mock).mock.calls[0][2](); });
  (apiClient.patch as jest.Mock).mockResolvedValueOnce({ ...wire, content: '我的修改' });
  fireEvent.press(screen.getByText('更新'));
  await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
  expect((apiClient.patch as jest.Mock).mock.calls[0][2]).toEqual({ 'If-Match': wire.update_time });
  expect((apiClient.patch as jest.Mock).mock.calls[1][2]).toEqual({ 'If-Match': '2026-09-07T10:00:00Z' });
});

test('reopening under another account never exposes the previous pending submission', async () => {
  const first = mount();
  await act(async () => {});
  fireEvent.changeText(first.getByPlaceholderText('此刻，有什么想记下来的？'), '账号一私密内容');
  (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  fireEvent.press(first.getByText('保存'));
  await first.findByText(/发布或更新失败/);
  const owner = getSession();
  expect(await readSubmission(owner)).toBeDefined();
  first.unmount();
  setSession('https://integration.example', 'another');
  const second = mount();
  await act(async () => {});
  expect(second.queryByText('有一份发布结果待核对')).toBeNull();
  expect(second.queryByDisplayValue('账号一私密内容')).toBeNull();
  expect(await readSubmission()).toBeUndefined();
});


test('locked capture hides old drafts, edit parameters and pending submissions', async () => {
  const { beginSubmission } = require('../src/services/submissions');
  await beginSubmission({ content: 'old secret', tags: [], visibility: 'private', attachments: [] });
  await AsyncStorage.setItem(`compose_draft:${getSession().scope}`, 'old secret');
  mockParams = { editItem: { content: 'capture draft', tags: [], attachments: [] } };
  const screen = mount({ lockedCapture: true });
  await act(async () => {});
  expect(screen.getByPlaceholderText('此刻，有什么想记下来的？').props.value).toBe('');
  expect(screen.queryByText('查看原提交内容')).toBeNull();
  expect(screen.queryByText('更新')).toBeNull();
  expect(apiClient.get).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByPlaceholderText('此刻，有什么想记下来的？'), 'new note');
  fireEvent.press(screen.getByText('保存'));
  await screen.findByText(/还有一份发布结果未确认/);
  expect((await readSubmission())?.payload.content).toBe('old secret');
  expect(screen.getByDisplayValue('new note')).toBeTruthy();
});

test('locked capture saves repeatedly without navigating or touching the regular draft', async () => {
  const key = `compose_draft:${getSession().scope}`;
  await AsyncStorage.setItem(key, 'new note');
  const screen = mount({ lockedCapture: true });
  await act(async () => {});
  for (const content of ['first note', 'second note']) {
    fireEvent.changeText(screen.getByPlaceholderText('此刻，有什么想记下来的？'), content);
    (apiClient.post as jest.Mock).mockResolvedValueOnce({ ...wire, content });
    fireEvent.press(screen.getByText('保存'));
    await waitFor(() => expect(screen.getByPlaceholderText('此刻，有什么想记下来的？').props.value).toBe(''));
    expect(screen.getByText('已保存')).toBeTruthy();
    expect(screen.queryByText(/仍受保护|仍然锁/)).toBeNull();
    expect(await AsyncStorage.getItem(key)).toBe('new note');
  }
  expect(apiClient.post).toHaveBeenCalledTimes(2);
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
  expect(await readSubmission()).toBeUndefined();
});

test('unlock request preserves a separate draft and regular editor can recover it', async () => {
  const onRequestUnlock = jest.fn();
  const screen = mount({ lockedCapture: true, onRequestUnlock });
  await act(async () => {});
  fireEvent.changeText(screen.getByPlaceholderText('此刻，有什么想记下来的？'), 'capture draft');
  fireEvent.press(screen.getByLabelText('解锁查看历史'));
  await waitFor(() => expect(onRequestUnlock).toHaveBeenCalled());
  const keys = await AsyncStorage.getAllKeys();
  expect(keys.filter(k => k.includes(':locked:'))).toHaveLength(1);
  screen.unmount();
  const lockedAgain = mount({ lockedCapture: true });
  await act(async () => {});
  expect(lockedAgain.queryByDisplayValue('capture draft')).toBeNull();
  lockedAgain.unmount();
  const regular = mount();
  await regular.findByDisplayValue('capture draft');
});

test('privacy entry authenticates directly, password fallback stays in a dialog, and cancellation preserves input', async () => {
  const store = configureStore({ reducer: { bbtalk: bbtalkReducer, tag: tagReducer } });
  const props = {
    locked: true, biometricAvailable: true, allowComposeWhenLocked: true,
    unlockPassword: '', unlocking: false, lockKeyboardH: new Animated.Value(0),
    onUnlockPasswordChange: jest.fn(), onUnlock: jest.fn(), onBiometricUnlock: jest.fn().mockResolvedValue('cancelled'),
    onCompose: jest.fn(), onVoiceRecord: jest.fn(), bottomInset: 0, theme: THEMES[0],
  };
  const tree = (allowComposeWhenLocked: boolean) => <Provider store={store}><PrivacyLockOverlay {...props} allowComposeWhenLocked={allowComposeWhenLocked} /></Provider>;
  const screen = render(tree(true));
  await act(async () => {});
  expect(screen.queryByText('内容已锁定')).toBeNull();
  fireEvent.changeText(screen.getByPlaceholderText('此刻，有什么想记下来的？'), 'keep this input');
  fireEvent.press(screen.getByLabelText('解锁查看历史'));
  await waitFor(() => expect(props.onBiometricUnlock).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('内容已锁定')).toBeNull();
  expect(screen.queryByLabelText('解锁密码')).toBeNull();
  expect(screen.getByDisplayValue('keep this input')).toBeTruthy();
  props.onBiometricUnlock.mockResolvedValue('password');
  fireEvent.press(screen.getByLabelText('解锁查看历史'));
  await screen.findByLabelText('解锁密码');
  expect(screen.queryByText('内容已锁定')).toBeNull();
  fireEvent.press(screen.getByLabelText('取消认证'));
  expect(screen.getByDisplayValue('keep this input')).toBeTruthy();
  expect(props.onUnlock).not.toHaveBeenCalled();
  props.biometricAvailable = false;
  screen.rerender(tree(true));
  fireEvent.press(screen.getByLabelText('解锁查看历史'));
  await screen.findByLabelText('解锁密码');
  expect(props.onBiometricUnlock).toHaveBeenCalledTimes(2);
  fireEvent.press(screen.getByLabelText('取消认证'));
  screen.rerender(tree(false));
  expect(screen.getByText('内容已锁定')).toBeTruthy();
  expect(screen.queryByText('快速记录')).toBeNull();
});


test('autosaves typing and restores after unmount without pressing back', async () => {
  const first = mount(); await act(async () => {});
  fireEvent.changeText(first.getByPlaceholderText('此刻，有什么想记下来的？'), '地铁上想到的事情');
  await first.findByText('草稿已保存到本机');
  first.unmount();
  const reopened = mount();
  await reopened.findByDisplayValue('地铁上想到的事情');
});

test('discard waits for previous writes and never restores discarded input', async () => {
  const screen = mount(); await act(async () => {});
  fireEvent.changeText(screen.getByPlaceholderText('此刻，有什么想记下来的？'), '真正丢弃');
  await act(async () => {});
  expect(mockPreventRemove.mock.calls.at(-1)[0]).toBe(true);
  const callback = mockPreventRemove.mock.calls.at(-1)[1];
  await act(async () => { callback({ preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } }); });
  const choose = (xActionSheet as jest.Mock).mock.calls.at(-1)[2];
  await act(async () => { await choose(1); });
  screen.unmount();
  const reopened = mount(); await act(async () => {});
  expect(reopened.queryByDisplayValue('真正丢弃')).toBeNull();
  expect(await AsyncStorage.getItem(`compose_draft:${getSession().scope}`)).toBeNull();
});

test('public visibility remains private until confirmation', async () => {
  const screen = mount(); await act(async () => {});
  fireEvent.press(screen.getByLabelText('修改可见性'));
  expect(screen.getByText('仅自己可见')).toBeTruthy();
  expect((xConfirm as jest.Mock).mock.calls.at(-1)[1]).toContain('无需登录');
  await act(async () => { (xConfirm as jest.Mock).mock.calls.at(-1)[2](); });
  expect(screen.getByText('公开可见')).toBeTruthy();
});


test('failed attachment upload survives remount and retries before submitting', async () => {
  const local = { id: 'pending-1', uri: 'file:///retained/photo.jpg', name: 'photo.jpg', mime: 'image/jpeg' };
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///temporary/photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' }] });
  (retainMedia as jest.Mock).mockResolvedValue(local);
  (uploadRetainedMedia as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const first = mount(); await act(async () => {});
  fireEvent.changeText(first.getByPlaceholderText('此刻，有什么想记下来的？'), '带照片的记录');
  fireEvent.press(first.getByLabelText('添加图片'));
  await first.findByText('重试上传');
  await first.findByText('草稿已保存到本机');
  first.unmount();
  const restored = mount();
  await restored.findByText('photo.jpg');
  const uploaded = { uid: 'uploaded-1', url: 'https://integration.example/file', type: 'image', filename: 'photo.jpg' };
  (uploadRetainedMedia as jest.Mock).mockResolvedValueOnce(uploaded);
  fireEvent.press(restored.getByText('重试上传'));
  await waitFor(() => expect(restored.queryByText('重试上传')).toBeNull());
  (apiClient.post as jest.Mock).mockResolvedValueOnce(wire);
  fireEvent.press(restored.getByText('保存'));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
  expect((apiClient.post as jest.Mock).mock.calls[0][1].attachments).toEqual([expect.objectContaining({ uid: 'uploaded-1' })]);
});
