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
import { xConfirm } from '../src/utils/crossAlert';

const mockNavigation = { goBack: jest.fn(), dispatch: jest.fn(), addListener: jest.fn(() => () => {}) };
let mockParams: any = {};
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation, useRoute: () => ({ params: mockParams }) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/services/api/apiClient', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('../src/config', () => ({ getApiBaseUrl: () => 'https://integration.example' }));
jest.mock('../src/services/api/mediaApi', () => ({ attachmentApi: { upload: jest.fn() } }));
jest.mock('../src/utils/imageSource', () => ({ buildImageSource: () => ({ uri: 'https://integration.example/image' }) }));
jest.mock('../src/utils/crossAlert', () => ({ xAlert: jest.fn(), xConfirm: jest.fn() }));
jest.mock('../src/components/VoiceRecordingOverlay', () => () => null);
jest.mock('react-native-markdown-display', () => 'Markdown');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({}), setAudioModeAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
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
  const input = first.getByPlaceholderText('你要BB什么？支持 Markdown，输入 # 添加标签');
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
  fireEvent.changeText(reopened.getByPlaceholderText('你要BB什么？支持 Markdown，输入 # 添加标签'), '后来输入');
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
  fireEvent.changeText(screen.getByPlaceholderText('你要BB什么？支持 Markdown，输入 # 添加标签'), '不能丢失');
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  fireEvent.press(screen.getByText('发布'));
  await screen.findByText(/发布或更新失败/);
  expect(apiClient.post).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('不能丢失')).toBeTruthy();
});

test('actual edit flow retains input on conflict and only advances the version after explicit review', async () => {
  mockParams = { editItem: { id: 'record-1', content: '旧内容', visibility: 'private', tags: [], attachments: [], updatedAt: wire.update_time } };
  const screen = mount();
  fireEvent.changeText(screen.getByPlaceholderText('你要BB什么？支持 Markdown，输入 # 添加标签'), '我的修改');
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
  fireEvent.changeText(first.getByPlaceholderText('你要BB什么？支持 Markdown，输入 # 添加标签'), '账号一私密内容');
  (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  fireEvent.press(first.getByText('发布'));
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
  expect(screen.getByPlaceholderText('你要BB什么？支持 Markdown，输入 # 添加标签').props.value).toBe('');
  expect(screen.queryByText('查看原提交内容')).toBeNull();
  expect(screen.queryByText('更新')).toBeNull();
  expect(apiClient.get).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByPlaceholderText('你要BB什么？支持 Markdown，输入 # 添加标签'), 'new note');
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
    fireEvent.changeText(screen.getByPlaceholderText('你要BB什么？支持 Markdown，输入 # 添加标签'), content);
    (apiClient.post as jest.Mock).mockResolvedValueOnce({ ...wire, content });
    fireEvent.press(screen.getByText('保存'));
    await waitFor(() => expect(screen.getByPlaceholderText('你要BB什么？支持 Markdown，输入 # 添加标签').props.value).toBe(''));
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
  fireEvent.changeText(screen.getByPlaceholderText('你要BB什么？支持 Markdown，输入 # 添加标签'), 'capture draft');
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

test('privacy entry starts in compose, cancel unlock preserves input, and disabled capture shows the lock', async () => {
  const store = configureStore({ reducer: { bbtalk: bbtalkReducer, tag: tagReducer } });
  const props = {
    locked: true, biometricAvailable: false, allowComposeWhenLocked: true,
    unlockPassword: '', unlocking: false, lockKeyboardH: new Animated.Value(0),
    onUnlockPasswordChange: jest.fn(), onUnlock: jest.fn(), onBiometricUnlock: jest.fn(),
    onCompose: jest.fn(), onVoiceRecord: jest.fn(), bottomInset: 0, theme: THEMES[0],
  };
  const tree = (allowComposeWhenLocked: boolean) => <Provider store={store}><PrivacyLockOverlay {...props} allowComposeWhenLocked={allowComposeWhenLocked} /></Provider>;
  const screen = render(tree(true));
  await act(async () => {});
  expect(screen.queryByText('内容已锁定')).toBeNull();
  fireEvent.changeText(screen.getByPlaceholderText('你要BB什么？支持 Markdown，输入 # 添加标签'), 'keep this input');
  fireEvent.press(screen.getByLabelText('解锁查看历史'));
  await screen.findByText('内容已锁定');
  fireEvent.press(screen.getByLabelText('返回记录'));
  expect(screen.getByDisplayValue('keep this input')).toBeTruthy();
  expect(props.onUnlock).not.toHaveBeenCalled();
  screen.rerender(tree(false));
  expect(screen.getByText('内容已锁定')).toBeTruthy();
  expect(screen.queryByText('快速记录')).toBeNull();
});
