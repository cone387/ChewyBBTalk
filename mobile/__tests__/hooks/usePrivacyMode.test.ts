jest.mock('react-native', () => ({
  Animated: { Value: jest.fn(), spring: jest.fn(() => ({ start: jest.fn() })) },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Keyboard: { addListener: jest.fn(() => ({ remove: jest.fn() })) },
  Platform: { OS: 'ios' },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn(),
}));
jest.mock('../../src/utils/errorHandler', () => ({ logError: jest.fn() }));

import { act, cleanup, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { usePrivacyMode } from '../../src/hooks/usePrivacyMode';

let settings: Record<string, string>;
let onLockChange: jest.Mock;
const showError = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  settings = { privacy_timeout_minutes: '1' };
  onLockChange = jest.fn();
  (AsyncStorage.getItem as jest.Mock).mockReset().mockImplementation(async (key: string) => settings[key] ?? null);
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function renderReady() {
  const hook = renderHook(() => usePrivacyMode({ onLockChange, showError }));
  await act(async () => {});
  expect(hook.result.current.settingsReady).toBe(true);
  return hook;
}

it('does not publish an unlocked state before stored lock settings finish loading', async () => {
  settings.privacy_locked = 'true';
  let resolveRead!: (value: string) => void;
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise<string>(resolve => { resolveRead = resolve; }));
  const { result } = renderHook(() => usePrivacyMode({ onLockChange, showError }));
  expect(result.current.settingsReady).toBe(false);
  expect(onLockChange).not.toHaveBeenCalled();
  await act(async () => { resolveRead('1'); });
  expect(result.current.settingsReady).toBe(true);
  expect(result.current.locked).toBe(true);
  expect(onLockChange).toHaveBeenCalledWith(true);
  expect(onLockChange).not.toHaveBeenCalledWith(false);
});

it('locks immediately when saved activity expired before app startup', async () => {
  settings.privacy_last_active = String(Date.now() - 61000);
  const { result } = await renderReady();
  expect(result.current.locked).toBe(true);
  expect(onLockChange).not.toHaveBeenCalledWith(false);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_locked', 'true');
});

it('extends the timeout on activity and persists the eventual lock', async () => {
  const { result } = await renderReady();
  await act(async () => { await jest.advanceTimersByTimeAsync(30000); });
  act(() => result.current.resetPrivacyTimer());
  await act(async () => { await jest.advanceTimersByTimeAsync(59000); });
  expect(result.current.locked).toBe(false);
  expect(result.current.privacySeconds).toBe(1);
  await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
  expect(result.current.locked).toBe(true);
  expect(onLockChange).toHaveBeenLastCalledWith(true);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_locked', 'true');
});

it('ignores a saved lock and elapsed timeout when privacy is disabled', async () => {
  settings.privacy_enabled = 'false';
  settings.privacy_locked = 'true';
  settings.privacy_last_active = String(Date.now() - 61000);
  const { result } = await renderReady();
  await act(async () => { await jest.advanceTimersByTimeAsync(61000); });
  expect(result.current.locked).toBe(false);
  expect(result.current.privacySeconds).toBeNull();
  expect(onLockChange).not.toHaveBeenCalledWith(true);
});

it.each(['user_cancel', 'user_fallback', 'success'])('handles biometric %s without accidentally unlocking', async (outcome) => {
  settings.privacy_locked = 'true';
  (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue(
    outcome === 'success' ? { success: true } : { success: false, error: outcome },
  );
  const { result } = await renderReady();
  let status: string | undefined;
  await act(async () => { status = await result.current.handleBiometricUnlock(); });
  expect(status).toBe(outcome === 'success' ? 'unlocked' : outcome === 'user_cancel' ? 'cancelled' : 'password');
  expect(result.current.locked).toBe(outcome !== 'success');
  if (outcome === 'success') {
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_locked', 'false');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_last_active', expect.any(String));
  } else {
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith('privacy_locked', 'false');
  }
});
