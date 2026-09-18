import React, { useState } from 'react';
import { AppState, Text, TouchableOpacity, type AppStateStatus } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
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
    <TouchableOpacity testID="record" {...gesture.handlers}><Text>record</Text></TouchableOpacity>
    <VoiceRecordingOverlay visible={visible} {...gesture}
      onFinish={result => { onFinish(result); setVisible(false); }}
      onCancel={() => { onCancel(); setVisible(false); }} />
  </>;
}
const touch = (pageY: number) => ({ nativeEvent: { pageY } });
beforeEach(() => {
  jest.clearAllMocks();
  mockPermission.mockResolvedValue({ granted: true });
  mockRecorder.prepareToRecordAsync.mockResolvedValue(undefined);
  mockRecorder.stop.mockResolvedValue(undefined);
});
afterEach(cleanup);

test('tap retains the original action; hold records and finger-up finishes exactly once', async () => {
  const screen = render(<Harness />);
  const button = screen.getByTestId('record');
  fireEvent(button, 'pressIn', touch(400)); fireEvent.press(button);
  expect(onTap).toHaveBeenCalledTimes(1);
  expect(mockRecorder.record).not.toHaveBeenCalled();
  fireEvent(button, 'pressIn', touch(400)); fireEvent(button, 'longPress');
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalledTimes(1));
  // Leaving the button's press rectangle must not finish before actual finger-up.
  fireEvent(button, 'pressOut');
  expect(mockRecorder.stop).not.toHaveBeenCalled();
  fireEvent(button, 'touchEnd'); fireEvent(button, 'touchEnd');
  await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  expect(onFinish).toHaveBeenCalledWith({ text: '', audioUri: 'file:///voice.m4a', audioDuration: 2 });
  fireEvent(button, 'pressIn', touch(400)); fireEvent(button, 'longPress');
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalledTimes(2));
  fireEvent(button, 'touchEnd');
  await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(2));
});

test('slide up then release discards the recording', async () => {
  const screen = render(<Harness />); const button = screen.getByTestId('record');
  fireEvent(button, 'pressIn', touch(400)); fireEvent(button, 'longPress');
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
  fireEvent(button, 'touchMove', touch(300));
  expect(screen.getByText('松手取消录音')).toBeTruthy();
  fireEvent(button, 'touchEnd');
  await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  expect(onFinish).not.toHaveBeenCalled();
});

test('release during permission request never starts a late recording', async () => {
  let grant!: (value: { granted: boolean }) => void;
  mockPermission.mockReturnValue(new Promise(resolve => { grant = resolve; }));
  const screen = render(<Harness />); const button = screen.getByTestId('record');
  fireEvent(button, 'pressIn', touch(400)); fireEvent(button, 'longPress');
  fireEvent(button, 'touchEnd');
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
  fireEvent(button, 'pressIn', touch(400)); fireEvent(button, 'longPress');
  await waitFor(() => expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalled());
  fireEvent(button, 'touchEnd');
  await act(async () => { prepared(); });
  expect(mockRecorder.record).not.toHaveBeenCalled();
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onFinish).not.toHaveBeenCalled();
});

test('touch cancellation stops without publishing', async () => {
  const screen = render(<Harness />); const button = screen.getByTestId('record');
  fireEvent(button, 'pressIn', touch(400)); fireEvent(button, 'longPress');
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
  fireEvent(button, 'touchCancel'); fireEvent(button, 'touchEnd');
  await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  expect(onFinish).not.toHaveBeenCalled();
});

test('sliding back restores finish, while leaving the page cleans up without publishing', async () => {
  const screen = render(<Harness />); const button = screen.getByTestId('record');
  fireEvent(button, 'pressIn', touch(400)); fireEvent(button, 'longPress');
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
  fireEvent(button, 'touchMove', touch(300)); fireEvent(button, 'touchMove', touch(390));
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
  fireEvent(button, 'pressIn', touch(400)); fireEvent(button, 'longPress');
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
  await act(async () => { change('background'); });
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onFinish).not.toHaveBeenCalled();
  listener.mockRestore();
});
