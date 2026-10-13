import React from 'react';
import { AppState } from 'react-native';
import { render, fireEvent, waitFor, act, cleanup } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OutboxSync from '../src/components/OutboxSync';
import OutboxScreen from '../src/screens/OutboxScreen';
import { enqueueSubmission, listOutbox, drainOutbox } from '../src/services/outbox';
import { apiClient } from '../src/services/api/apiClient';
import { setSession, clearSession, getSession } from '../src/services/session';
import { setHistoryLocked } from '../src/services/historyPrivacy';
import { updateSyncConnectivity } from '../src/services/syncConnectivity';
import { xConfirm } from '../src/utils/crossAlert';

let mockNetwork: (state: any) => void;
const mockNavigation = { navigate: jest.fn(), popToTop: jest.fn() };
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: (callback: any) => { mockNetwork = callback; callback({ isConnected: false }); return () => {}; } } }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/services/api/apiClient', () => ({ apiClient: { post: jest.fn(), patch: jest.fn(), get: jest.fn() } }));
jest.mock('../src/services/pendingMedia', () => ({ uploadRetainedMedia: jest.fn() }));
jest.mock('../src/config', () => ({ getApiBaseUrl: () => 'https://outbox.example' }));
jest.mock('../src/utils/crossAlert', () => ({ xConfirm: jest.fn() }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (callback: any) => { const React = require('react'); React.useEffect(callback, [callback]); },
}));
const wire = { uid: 'record', content: '离线保存的记录', visibility: 'private', tags: [], attachments: [], update_time: 'v2' };
const input = () => ({ payload: { content: wire.content, tags: [], attachments: [], visibility: 'private' as const }, pendingMedia: [], sourceDraftKey: `compose_draft:${getSession().scope}` });
beforeEach(async () => {
  jest.clearAllMocks(); await AsyncStorage.clear(); clearSession(); setSession('https://outbox.example', 'owner');
  setHistoryLocked(false); updateSyncConnectivity(false); AppState.currentState = 'active';
  (apiClient.post as jest.Mock).mockReset().mockResolvedValue(wire);
  (apiClient.patch as jest.Mock).mockReset().mockResolvedValue(wire);
  (apiClient.get as jest.Mock).mockReset().mockResolvedValue(wire);
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

test('network recovery automatically syncs a durable entry and shows the confirmed receipt', async () => {
  const entry = await enqueueSubmission(input());
  const screen = render(<><OutboxSync /><OutboxScreen /></>);
  await screen.findByText('已保存到本机 · 等待同步');
  expect(apiClient.post).not.toHaveBeenCalled();
  await act(async () => { mockNetwork({ isConnected: true, isInternetReachable: true }); });
  await screen.findByText('已保存到服务器');
  expect((apiClient.post as jest.Mock).mock.calls[0][2]).toEqual({ 'Idempotency-Key': entry.id });
  fireEvent.press(screen.getByText('查看记录'));
  expect(mockNavigation.navigate).toHaveBeenCalledWith('RecordDetail', { item: expect.objectContaining({ id: 'record' }) });
});

test('foreground recovery resumes a persisted syncing entry with the original key', async () => {
  const entry = await enqueueSubmission(input());
  await AsyncStorage.setItem(`outbox:${getSession().scope}`, JSON.stringify([{ ...entry, state: 'syncing', attempted: true }]));
  AppState.currentState = 'background';
  const listeners = new Set<(state: any) => void>();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => { listeners.add(cb); return { remove: () => listeners.delete(cb) }; });
  render(<OutboxSync />);
  await act(async () => { mockNetwork({ isConnected: true }); });
  expect(apiClient.post).not.toHaveBeenCalled();
  await act(async () => { AppState.currentState = 'active'; listeners.forEach(fn => fn('active')); });
  await waitFor(async () => expect((await listOutbox())[0].state).toBe('synced'));
  expect((apiClient.post as jest.Mock).mock.calls[0][2]).toEqual({ 'Idempotency-Key': entry.id });
});

test('network recovery during an unfinished request resumes as soon as that attempt settles', async () => {
  let finish!: (reason: unknown) => void;
  (apiClient.post as jest.Mock).mockImplementationOnce(() => new Promise((_resolve, reject) => { finish = reject; }));
  await enqueueSubmission(input()); render(<OutboxSync />);
  await act(async () => { mockNetwork({ isConnected: true }); });
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
  await act(async () => { mockNetwork({ isConnected: false }); mockNetwork({ isConnected: true }); finish(new Error('connection interrupted')); });
  await waitFor(async () => expect((await listOutbox())[0].state).toBe('synced'));
  expect(apiClient.post).toHaveBeenCalledTimes(2);
});

test('conflict screen preserves both versions and only overwrites after confirmation', async () => {
  await enqueueSubmission({ ...input(), recordId: 'record', expectedUpdatedAt: 'v1' });
  (apiClient.patch as jest.Mock).mockRejectedValueOnce({ status: 409, code: 'edit_conflict', current: { ...wire, content: '服务器的新内容' } });
  await drainOutbox();
  const screen = render(<OutboxScreen />);
  await screen.findByText('服务器的新内容');
  expect(screen.getByText(wire.content)).toBeTruthy();
  fireEvent.press(screen.getByText('比较后，使用本机修改更新'));
  expect(apiClient.patch).toHaveBeenCalledTimes(1);
  await act(async () => { updateSyncConnectivity(true); (xConfirm as jest.Mock).mock.calls[0][2](); });
  await screen.findByText('已保存到服务器');
  expect((apiClient.patch as jest.Mock).mock.calls[1][2]).toEqual({ 'If-Match': 'v2' });
  await act(async () => { setHistoryLocked(true); });
  expect(screen.queryByText(wire.content)).toBeNull();
  expect(screen.getByText('同步记录已锁定')).toBeTruthy();
});
