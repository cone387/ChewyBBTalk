import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import WelcomeGate from '../src/components/WelcomeGate';
import WelcomeSettingsScreen from '../src/screens/WelcomeSettingsScreen';
import PrivacyBoundary from '../src/components/PrivacyBoundary';
import { welcomeApi } from '../src/services/api/welcomeApi';
import { clearSession, setSession } from '../src/services/session';
import { setHistoryLocked, setHistoryPrivacyReady, setHistoryPrivacySuspended } from '../src/services/historyPrivacy';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('../src/hooks/usePrivacyMode', () => ({ usePrivacyController: () => ({}) }));
jest.mock('../src/components/PrivacyLockOverlay', () => () => require('react').createElement(require('react-native').Text, null, '统一解锁入口'));
jest.mock('../src/services/api/welcomeApi', () => ({ welcomeApi: { get: jest.fn(), save: jest.fn(), next: jest.fn() } }));
const one = { id: 'one', text: '慢慢来，比较快。', source: '我的手记' };
const two = { id: 'two', text: '今天也值得被记下来。', source: '' };
beforeEach(() => {
  jest.clearAllMocks(); clearSession(); setSession('https://example.test', 1);
  setHistoryPrivacyReady(true); setHistoryLocked(false);
  (welcomeApi.get as jest.Mock).mockResolvedValue({ enabled: false, quotes: [], revision: 0 });
  (welcomeApi.save as jest.Mock).mockImplementation(async config => ({ ...config, revision: config.revision + 1 }));
});

test('startup waits for privacy, switches quotes, and does not repeat after entering or remounting', async () => {
  (welcomeApi.next as jest.Mock).mockResolvedValueOnce({ quote: one }).mockResolvedValueOnce({ quote: two });
  setHistoryLocked(true);
  const component = <WelcomeGate onSettings={jest.fn()}><Text>锁定时的快捷记录</Text><Text>记录首页</Text></WelcomeGate>;
  const screen = render(component);
  expect(welcomeApi.next).not.toHaveBeenCalled();
  expect(screen.getByText('锁定时的快捷记录')).toBeTruthy();
  act(() => setHistoryLocked(false));
  await screen.findByText(one.text);
  fireEvent.press(screen.getByText('换一句'));
  await screen.findByText(two.text);
  act(() => setHistoryLocked(true));
  expect(screen.queryByText(two.text)).toBeNull();
  expect(screen.getByText('锁定时的快捷记录')).toBeTruthy();
  act(() => setHistoryLocked(false));
  expect(screen.getByText(two.text)).toBeTruthy();
  fireEvent.press(screen.getByText('进入记录'));
  expect(screen.getByText('记录首页')).toBeTruthy();
  screen.unmount();
  const again=render(component);
  expect(again.getByText('记录首页')).toBeTruthy();
  expect(welcomeApi.next).toHaveBeenCalledTimes(2);
});

test.each(['background', 'lock'])('interrupted initial settings load offers retry after %s', async reason => {
  let resolve!: (value: unknown) => void;
  (welcomeApi.get as jest.Mock).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const screen = render(<PrivacyBoundary preserveState><WelcomeSettingsScreen /></PrivacyBoundary>);
  await waitFor(() => expect(welcomeApi.get).toHaveBeenCalledTimes(1));
  act(() => { if (reason === 'lock') setHistoryLocked(true); else setHistoryPrivacySuspended(true); });
  await act(async () => resolve({ enabled: true, quotes: [one], revision: 1 }));
  act(() => { setHistoryLocked(false); setHistoryPrivacySuspended(false); });
  expect(screen.queryByText(one.text)).toBeNull();
  fireEvent.press(await screen.findByText('重新载入'));
  await screen.findByText('还没有文案');
});

test('offline startup bypasses the page, and a switched account never sees the previous quote', async () => {
  (welcomeApi.next as jest.Mock).mockResolvedValueOnce({ quote: one }).mockRejectedValueOnce(new Error('offline'));
  const screen=render(<WelcomeGate onSettings={jest.fn()}><Text>记录首页</Text></WelcomeGate>);
  await screen.findByText(one.text);
  act(() => setSession('https://example.test',2));
  expect(screen.queryByText(one.text)).toBeNull();
  act(() => { setHistoryPrivacyReady(true); setHistoryLocked(false); });
  await screen.findByText('记录首页');
});

test('personal settings save, preview without rotation, edit, enable and delete', async () => {
  const screen=render(<WelcomeSettingsScreen />);
  await screen.findByText('还没有文案');
  fireEvent.changeText(screen.getByLabelText('文案正文'),'自己的第一句话');
  fireEvent.changeText(screen.getByLabelText('出处（可选）'),'手记');
  fireEvent.press(screen.getByText('加入文案池'));
  await screen.findByText('自己的第一句话');
  fireEvent.press(screen.getByLabelText('预览文案 1'));
  expect(screen.getByText('写在今天之前')).toBeTruthy();
  expect(welcomeApi.next).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('返回文案设置'));
  fireEvent.press(screen.getByLabelText('编辑文案 1'));
  fireEvent.changeText(screen.getByLabelText('文案正文'),'修改后的句子');
  fireEvent.press(screen.getByText('保存修改'));
  await screen.findByText('修改后的句子');
  fireEvent(screen.getByLabelText('开启文案欢迎页'),'valueChange',true);
  await waitFor(() => expect(welcomeApi.save).toHaveBeenLastCalledWith(expect.objectContaining({ enabled:true })));
  fireEvent.press(screen.getByLabelText('删除文案 1'));
  await screen.findByText('还没有文案');
});

test('conflict reload preserves a draft and privacy lock hides settings and preview', async () => {
  const screen=render(<PrivacyBoundary preserveState><WelcomeSettingsScreen /></PrivacyBoundary>);
  await screen.findByText('还没有文案');
  fireEvent.changeText(screen.getByLabelText('文案正文'),'保留这份草稿');
  (welcomeApi.save as jest.Mock).mockRejectedValueOnce({ status:409 });
  fireEvent.press(screen.getByText('加入文案池'));
  await screen.findByText('重新载入');
  (welcomeApi.get as jest.Mock).mockResolvedValueOnce({ enabled:true,quotes:[one],revision:2 });
  fireEvent.press(screen.getByText('重新载入'));
  await screen.findByText(one.text);
  expect(screen.getByLabelText('文案正文').props.value).toBe('保留这份草稿');
  fireEvent.press(screen.getByLabelText('预览文案 1'));
  act(() => setHistoryLocked(true));
  expect(screen.queryByText(one.text)).toBeNull();
});
