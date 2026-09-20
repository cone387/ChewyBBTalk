import React, { useState } from 'react';
import { AppState, Text, View, type AppStateStatus } from 'react-native';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import VoiceRecordingOverlay from '../src/components/VoiceRecordingOverlay';
import { useHoldToRecord } from '../src/hooks/useHoldToRecord';

const mockRecorder = {
  prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(),
  getStatus: jest.fn(() => ({ durationMillis: 1600 })), uri: 'file:///voice.m4a',
};
const mockPermission = jest.fn();
jest.mock('expo-audio', () => ({
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ durationMillis: 1600, isRecording: true }),
  RecordingPresets: { HIGH_QUALITY: {} },
  AudioModule: { requestRecordingPermissionsAsync: () => mockPermission() },
  setAudioModeAsync: jest.fn(async () => {}),
}));
jest.mock('@react-native-voice/voice', () => ({ default: null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/utils/crossAlert', () => ({ xAlert: jest.fn() }));

const onFinish = jest.fn();
const onCancel = jest.fn();
const onTap = jest.fn();
function Harness() {
  const [visible, setVisible] = useState(false);
  const gesture = useHoldToRecord(() => setVisible(true), visible, onTap);
  return <>
    <View testID="record" {...gesture.handlers}><Text>record</Text></View>
    <VoiceRecordingOverlay visible={visible} {...gesture}
      onFinish={result => { onFinish(result); setVisible(false); }}
      onCancel={() => { onCancel(); setVisible(false); }} />
  </>;
}
const touch = (pageY: number) => ({ nativeEvent: { pageX: 100, pageY } });
// Dispatch only handlers on the host view, never walk up to composite props as fireEvent does.
function nativeEvent(button: ReturnType<ReturnType<typeof render>['getByTestId']>, name: string, event = touch(400)) {
  expect(typeof button.type).toBe('string');
  expect(button.props[name]).toEqual(expect.any(Function));
  act(() => { button.props[name](event); });
}
function hold(button: Parameters<typeof nativeEvent>[0]) {
  nativeEvent(button, 'onResponderGrant');
  act(() => { jest.advanceTimersByTime(300); });
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  mockPermission.mockResolvedValue({ granted: true });
  mockRecorder.prepareToRecordAsync.mockResolvedValue(undefined);
  mockRecorder.stop.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

test('release before the long-press threshold only taps and clears pending startup', () => {
  const screen = render(<Harness />); const button = screen.getByTestId('record');
  nativeEvent(button, 'onResponderGrant');
  act(() => { jest.advanceTimersByTime(299); });
  nativeEvent(button, 'onResponderRelease');
  act(() => { jest.advanceTimersByTime(1000); });
  expect(onTap).toHaveBeenCalledTimes(1);
  expect(mockPermission).not.toHaveBeenCalled();
});

test.each(['move', 'terminate', 'unmount', 'background'])('%s before the threshold prevents late recording and taps', async action => {
  const listeners: Array<(state: AppStateStatus) => void> = [];
  const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
    listeners.push(cb); return { remove: jest.fn() };
  });
  try {
    const screen = render(<Harness />); const button = screen.getByTestId('record');
    nativeEvent(button, 'onResponderGrant');
    act(() => { jest.advanceTimersByTime(150); });
    if (action === 'move') {
      nativeEvent(button, 'onResponderMove', touch(300));
      nativeEvent(button, 'onResponderRelease');
    } else if (action === 'terminate') {
      nativeEvent(button, 'onResponderTerminate');
      nativeEvent(button, 'onResponderRelease');
    } else if (action === 'background') {
      act(() => { listeners.forEach(cb => cb('background')); });
    } else {
      screen.unmount();
    }
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(mockPermission).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
  } finally {
    listener.mockRestore();
  }
});

test('sliding back before release finishes and recording retains the responder', async () => {
  const screen = render(<Harness />); const button = screen.getByTestId('record');
  expect(button.props.onStartShouldSetResponder()).toBe(true);
  hold(button);
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalledTimes(1));
  expect(button.props.onStartShouldSetResponder()).toBe(false);
  expect(button.props.onResponderTerminationRequest()).toBe(false);
  nativeEvent(button, 'onResponderMove', touch(300));
  nativeEvent(button, 'onResponderMove', touch(390));
  expect(screen.getByText('松手结束，上滑取消')).toBeTruthy();
  expect(mockRecorder.stop).not.toHaveBeenCalled();
  nativeEvent(button, 'onResponderRelease');
  await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  expect(onTap).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
});

test('tap retains the original action; hold records and finger-up finishes exactly once', async () => {
  const screen = render(<Harness />);
  const button = screen.getByTestId('record');
  nativeEvent(button, 'onResponderGrant'); nativeEvent(button, 'onResponderRelease');
  expect(onTap).toHaveBeenCalledTimes(1);
  expect(mockRecorder.record).not.toHaveBeenCalled();
  hold(button);
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalledTimes(1));
  // Leaving the button's press rectangle must not finish before actual finger-up.
  nativeEvent(button, 'onResponderMove', touch(500));
  expect(mockRecorder.stop).not.toHaveBeenCalled();
  nativeEvent(button, 'onResponderRelease'); nativeEvent(button, 'onResponderRelease');
  await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  expect(onFinish).toHaveBeenCalledWith({ text: '', audioUri: 'file:///voice.m4a', audioDuration: 2 });
  hold(button);
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalledTimes(2));
  nativeEvent(button, 'onResponderRelease');
  await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(2));
});

test('slide up then release discards the recording', async () => {
  const screen = render(<Harness />); const button = screen.getByTestId('record');
  hold(button);
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
  nativeEvent(button, 'onResponderMove', touch(300));
  expect(screen.getByText('松手取消录音')).toBeTruthy();
  nativeEvent(button, 'onResponderRelease');
  await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  expect(onFinish).not.toHaveBeenCalled();
});

test('release during permission request never starts a late recording', async () => {
  let grant!: (value: { granted: boolean }) => void;
  mockPermission.mockReturnValue(new Promise(resolve => { grant = resolve; }));
  const screen = render(<Harness />); const button = screen.getByTestId('record');
  hold(button);
  nativeEvent(button, 'onResponderRelease');
  await act(async () => { grant({ granted: true }); });
  expect(mockRecorder.record).not.toHaveBeenCalled();
  expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
  expect(onFinish).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test('release during preparation cleans up without starting or publishing', async () => {
  let prepared!: () => void;
  mockRecorder.prepareToRecordAsync.mockReturnValue(new Promise<void>(resolve => { prepared = resolve; }));
  const screen = render(<Harness />); const button = screen.getByTestId('record');
  hold(button);
  await waitFor(() => expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalled());
  nativeEvent(button, 'onResponderRelease');
  await act(async () => { prepared(); });
  expect(mockRecorder.record).not.toHaveBeenCalled();
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onFinish).not.toHaveBeenCalled();
});

test('touch cancellation stops without publishing', async () => {
  const screen = render(<Harness />); const button = screen.getByTestId('record');
  hold(button);
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
  nativeEvent(button, 'onResponderTerminate'); nativeEvent(button, 'onResponderRelease');
  await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  expect(onFinish).not.toHaveBeenCalled();
});

test('sliding back restores finish, while leaving the page cleans up without publishing', async () => {
  const screen = render(<Harness />); const button = screen.getByTestId('record');
  hold(button);
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
  nativeEvent(button, 'onResponderMove', touch(300)); nativeEvent(button, 'onResponderMove', touch(390));
  expect(screen.getByText('松手结束，上滑取消')).toBeTruthy();
  await act(async () => { screen.unmount(); });
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  expect(onFinish).not.toHaveBeenCalled();
});

test('background interruption cancels and stops the microphone', async () => {
  let change!: (state: AppStateStatus) => void;
  const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
    change = cb; return { remove: jest.fn() };
  });
  const screen = render(<Harness />); const button = screen.getByTestId('record');
  hold(button);
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
  await act(async () => { change('background'); });
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onFinish).not.toHaveBeenCalled();
  listener.mockRestore();
});
