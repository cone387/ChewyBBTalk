import React, { useEffect, useState } from 'react';
import { Modal, Text, TextInput, View } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import PrivacyBoundary from '../src/components/PrivacyBoundary';
import { setHistoryLocked, setHistoryPrivacyReady, setHistoryPrivacySuspended } from '../src/services/historyPrivacy';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('../src/hooks/usePrivacyMode', () => ({ usePrivacyController: () => ({}) }));
jest.mock('../src/components/PrivacyLockOverlay', () => () => require('react').createElement(require('react-native').Text, null, '统一解锁入口'));

beforeEach(() => { setHistoryLocked(false); setHistoryPrivacyReady(true); setHistoryPrivacySuspended(false); });
test('a cold protected deep link does not mount content before the privacy check', () => {
  setHistoryPrivacyReady(false);
  const mount = jest.fn();
  function Content() { useEffect(mount, []); return <Text>私人标签</Text>; }
  const screen = render(<PrivacyBoundary><Content /></PrivacyBoundary>);
  expect(mount).not.toHaveBeenCalled(); expect(screen.queryByText('私人标签')).toBeNull();
  act(() => { setHistoryLocked(true); setHistoryPrivacyReady(true); });
  expect(screen.getByText('统一解锁入口')).toBeTruthy();
  expect(mount).not.toHaveBeenCalled();
  act(() => setHistoryLocked(false));
  expect(screen.getByText('私人标签')).toBeTruthy(); expect(mount).toHaveBeenCalledTimes(1);
});

test('locking unmounts native modals and releases active media instead of hiding only a parent view', () => {
  const pause = jest.fn();
  function Media() { useEffect(() => () => pause(), []); return <Modal visible><Text>私人照片</Text></Modal>; }
  const screen = render(<PrivacyBoundary><Media /></PrivacyBoundary>);
  expect(screen.getByText('私人照片')).toBeTruthy();
  act(() => setHistoryLocked(true));
  expect(screen.queryByText('私人照片')).toBeNull(); expect(pause).toHaveBeenCalledTimes(1);
  expect(screen.getByText('统一解锁入口')).toBeTruthy();
});

test('initial readiness check shows a useful loading state instead of a blank screen', () => {
  const screen = render(<PrivacyBoundary><Text>私密存储配置</Text></PrivacyBoundary>);
  act(() => setHistoryPrivacyReady(false));
  expect(screen.queryByText('私密存储配置')).toBeNull();
  expect(screen.queryByText('统一解锁入口')).toBeNull();
  expect(screen.getByText('正在准备私人空间…')).toBeTruthy();
});

test('a brief background transition preserves form and native modal state behind the preview curtain', () => {
  const unmount = jest.fn();
  function Form() { const [value, setValue] = useState(''); useEffect(() => () => unmount(), []); return <Modal visible><TextInput accessibilityLabel="未保存配置" value={value} onChangeText={setValue} /></Modal>; }
  const screen = render(<PrivacyBoundary><Form /></PrivacyBoundary>);
  fireEvent.changeText(screen.getByLabelText('未保存配置'), '正在编辑');
  act(() => setHistoryPrivacySuspended(true));
  act(() => setHistoryPrivacySuspended(false));
  expect(screen.getByLabelText('未保存配置').props.value).toBe('正在编辑');
  expect(unmount).not.toHaveBeenCalled();
});

test('the editor retains unsaved state while its privacy-aware content is hidden', () => {
  function Editor() { const [value, setValue] = useState(''); return <View><TextInput accessibilityLabel="正文" value={value} onChangeText={setValue} /></View>; }
  const screen = render(<PrivacyBoundary preserveState><Editor /></PrivacyBoundary>);
  fireEvent.changeText(screen.getByLabelText('正文'), '尚未保存');
  act(() => setHistoryLocked(true));
  expect(screen.queryByLabelText('正文')).toBeNull();
  act(() => setHistoryLocked(false));
  expect(screen.getByLabelText('正文').props.value).toBe('尚未保存');
});
