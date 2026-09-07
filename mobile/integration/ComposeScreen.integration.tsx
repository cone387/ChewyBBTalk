import React from 'react';
import { render, fireEvent, waitFor, act, cleanup } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ComposeScreen from '../src/screens/ComposeScreen';
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
function mount() {
  const store = configureStore({ reducer: { bbtalk: bbtalkReducer, tag: tagReducer } });
  return { ...render(<Provider store={store}><ComposeScreen /></Provider>), store };
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
