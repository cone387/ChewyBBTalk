import React from 'react';
import { act, cleanup, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenCapture from 'expo-screen-capture';

let mockPlatformOS = 'android';
const mockAppStateListeners = new Set<(state: string) => void>();
const mockPreferenceListeners = new Set<() => void>();
let mockRevision = 0;

jest.mock('react-native', () => ({
  Platform: { get OS() { return mockPlatformOS; } },
  AppState: { addEventListener: (_: string, listener: (state: string) => void) => {
    mockAppStateListeners.add(listener);
    return { remove: () => mockAppStateListeners.delete(listener) };
  } },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn() }));
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(), allowScreenCaptureAsync: jest.fn(),
}));
jest.mock('../../src/services/privacyPreferences', () => ({
  subscribePrivacyPreferences: (listener: () => void) => {
    mockPreferenceListeners.add(listener);
    return () => mockPreferenceListeners.delete(listener);
  },
  getPrivacyPreferencesRevision: () => mockRevision,
}), { virtual: true });

import ScreenCaptureProtection from '../../src/components/ScreenCaptureProtection';

const prevent = ScreenCapture.preventScreenCaptureAsync as jest.Mock;
const allow = ScreenCapture.allowScreenCaptureAsync as jest.Mock;
const read = AsyncStorage.getItem as jest.Mock;
const flush = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const notify = async () => { mockRevision++; mockPreferenceListeners.forEach(listener => listener()); await flush(); };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  mockPlatformOS = 'android';
  read.mockReset().mockResolvedValue(null);
  prevent.mockReset().mockResolvedValue(undefined);
  allow.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => { cleanup(); await flush(); });

it.each([null, 'false', 'TRUE'])('does not restrict capture without explicit opt-in (%s)', async value => {
  read.mockResolvedValue(value);
  render(<ScreenCaptureProtection />);
  await flush();
  expect(read).toHaveBeenCalledWith('privacy_block_capture');
  expect(prevent).not.toHaveBeenCalled();
  expect(allow).not.toHaveBeenCalled();
});

it.each(['android', 'ios'])('applies opt-in on %s and releases its restriction on unmount', async os => {
  mockPlatformOS = os;
  read.mockResolvedValue('true');
  const view = render(<ScreenCaptureProtection />);
  await flush();
  expect(prevent).toHaveBeenCalledWith('app-privacy');
  view.unmount();
  await flush();
  expect(allow).toHaveBeenCalledWith('app-privacy');
});

it('does nothing on web', async () => {
  mockPlatformOS = 'web';
  render(<ScreenCaptureProtection />);
  await flush();
  expect(read).not.toHaveBeenCalled();
  expect(prevent).not.toHaveBeenCalled();
});

it('reacts immediately to saved preferences and refreshes on foreground', async () => {
  render(<ScreenCaptureProtection />);
  await flush();
  read.mockResolvedValue('true');
  await notify();
  expect(prevent).toHaveBeenCalledTimes(1);
  read.mockResolvedValue('false');
  mockAppStateListeners.forEach(listener => listener('active'));
  await flush();
  expect(allow).toHaveBeenCalledTimes(1);
});

it('ignores an old opt-in read after a newer opt-out', async () => {
  const oldRead = deferred<string | null>();
  read.mockReturnValueOnce(oldRead.promise).mockResolvedValue('false');
  render(<ScreenCaptureProtection />);
  await notify();
  oldRead.resolve('true');
  await flush();
  expect(prevent).not.toHaveBeenCalled();
});

it('ignores a pending opt-in read after unmount', async () => {
  const pending = deferred<string>();
  read.mockReturnValue(pending.promise);
  const view = render(<ScreenCaptureProtection />);
  view.unmount();
  pending.resolve('true');
  await flush();
  expect(prevent).not.toHaveBeenCalled();
  expect(mockPreferenceListeners.size).toBe(0);
  expect(mockAppStateListeners.size).toBe(0);
});

it('serializes an in-flight release before a rapid renewed opt-in', async () => {
  const release = deferred<void>();
  read.mockResolvedValue('true');
  render(<ScreenCaptureProtection />);
  await flush();
  allow.mockReturnValueOnce(release.promise);
  read.mockResolvedValue('false');
  await notify();
  read.mockResolvedValue('true');
  await notify();
  expect(prevent).toHaveBeenCalledTimes(1);
  release.resolve();
  await flush();
  expect(prevent).toHaveBeenCalledTimes(2);
  expect(allow).toHaveBeenCalledTimes(1);
});

it('finishes a pending prevent before unmount cleanup and a fresh mount', async () => {
  const pending = deferred<void>();
  prevent.mockReturnValueOnce(pending.promise);
  read.mockResolvedValue('true');
  const oldView = render(<ScreenCaptureProtection />);
  await flush();
  oldView.unmount();
  render(<ScreenCaptureProtection />);
  await flush();
  expect(allow).not.toHaveBeenCalled();
  pending.resolve();
  await flush();
  expect(allow).not.toHaveBeenCalled();
  expect(prevent).toHaveBeenCalledTimes(1);
});

it('does not enable protection on storage failure and can recover', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  read.mockRejectedValueOnce(new Error('storage unavailable'));
  render(<ScreenCaptureProtection />);
  await flush();
  expect(prevent).not.toHaveBeenCalled();
  read.mockResolvedValue('true');
  await notify();
  expect(prevent).toHaveBeenCalledTimes(1);
  warning.mockRestore();
});

it('recovers from a native rejection without poisoning subsequent changes', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  prevent.mockRejectedValueOnce(new Error('native unavailable'));
  read.mockResolvedValue('true');
  render(<ScreenCaptureProtection />);
  await flush();
  read.mockResolvedValue('false');
  await notify();
  read.mockResolvedValue('true');
  await notify();
  expect(prevent).toHaveBeenCalledTimes(2);
  expect(allow).toHaveBeenCalledTimes(1);
  warning.mockRestore();
});

it('reapplies opt-in after a rejected release that may have changed native state', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  read.mockResolvedValue('true');
  render(<ScreenCaptureProtection />);
  await flush();
  allow.mockRejectedValueOnce(new Error('release completion lost'));
  read.mockResolvedValue('false');
  await notify();
  read.mockResolvedValue('true');
  await notify();
  expect(prevent).toHaveBeenCalledTimes(2);
  warning.mockRestore();
});

it('clears Expo ownership after a failed prevent so foreground can retry', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  prevent.mockRejectedValueOnce(new Error('prevent completion lost'));
  read.mockResolvedValue('true');
  render(<ScreenCaptureProtection />);
  await flush();
  expect(allow).toHaveBeenCalledWith('app-privacy');
  mockAppStateListeners.forEach(listener => listener('active'));
  await flush();
  expect(prevent).toHaveBeenCalledTimes(2);
  warning.mockRestore();
});
