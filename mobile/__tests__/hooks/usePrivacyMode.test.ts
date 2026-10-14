// Factory-internal listener registries let tests fire keyboard/AppState events
// and flip Platform.OS between mounts.
jest.mock('react-native', () => {
  const state = { os: 'ios' };
  const kbListeners: Array<{ event: string; cb: (e: any) => void }> = [];
  const appStateListeners: Array<(next: string) => void> = [];
  return {
    __esModule: true,
    Animated: { Value: jest.fn(), spring: jest.fn(() => ({ start: jest.fn() })) },
    AppState: { addEventListener: jest.fn((_type: string, cb: (next: string) => void) => { appStateListeners.push(cb); return { remove: jest.fn() }; }) },
    Keyboard: { addListener: jest.fn((event: string, cb: (e: any) => void) => { kbListeners.push({ event, cb }); return { remove: jest.fn() }; }) },
    get Platform() { return { get OS() { return state.os; } }; },
    __state: state,
    __kbListeners: kbListeners,
    __appStateListeners: appStateListeners,
  };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn(),
}));
jest.mock('../../src/utils/errorHandler', () => ({ logError: jest.fn() }));
jest.mock('../../src/services/auth', () => ({ login: jest.fn(), getCurrentUser: jest.fn() }));

import { act, cleanup, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import React from 'react';
import { usePrivacyMode, PrivacyProvider, usePrivacyController } from '../../src/hooks/usePrivacyMode';
import { historyIsLocked, historyPrivacyIsReady, recordHistoryActivity } from '../../src/services/historyPrivacy';
import { setSession, clearSession } from '../../src/services/session';

const RN: any = require('react-native');
const authSvc: any = require('../../src/services/auth');
const { logError } = require('../../src/utils/errorHandler');

let settings: Record<string, string>;
let onLockChange: jest.Mock;
const showError = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  clearSession();
  settings = { privacy_timeout_minutes: '1' };
  onLockChange = jest.fn();
  RN.__state.os = 'ios';
  RN.__kbListeners.length = 0;
  RN.__appStateListeners.length = 0;
  (AsyncStorage.getItem as jest.Mock).mockReset().mockImplementation(async (key: string) => settings[key] ?? null);
});

describe('privacy lifecycle safety', () => {
  it('enforces the deadline even when a settings poll never resolves', async () => {
    const { result } = await renderReady();
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => { await jest.advanceTimersByTimeAsync(61000); });
    expect(result.current.locked).toBe(true);
  });

  it('falls back to a bounded timeout when a stored timeout is malformed', async () => {
    settings.privacy_timeout_minutes = 'not-a-number';
    const { result } = await renderReady();
    await act(async () => { await jest.advanceTimersByTimeAsync(301000); });
    expect(result.current.locked).toBe(true);
  });

  it.each(['NaN', '999999999999999'])('locks instead of trusting an invalid saved activity time: %s', async (value) => {
    settings.privacy_last_active = value;
    const { result } = await renderReady();
    expect(result.current.locked).toBe(true);
  });

  it('fails closed when an unlock cannot be persisted', async () => {
    settings.privacy_locked = 'true';
    const { result } = await renderReady();
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk unavailable'));
    await act(async () => { result.current.setLocked(false); });
    expect(result.current.locked).toBe(true);
  });

  it('ignores successful authentication after the app really enters the background', async () => {
    settings.privacy_locked = 'true';
    const { result } = await renderReady();
    let resolveAuth!: (value: { success: boolean }) => void;
    (LocalAuthentication.authenticateAsync as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveAuth = resolve; }));
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.handleBiometricUnlock(); });
    await act(async () => { for (const cb of RN.__appStateListeners) cb('background'); });
    await act(async () => { resolveAuth({ success: true }); await pending; });
    expect(result.current.locked).toBe(true);
    expect(result.current.settingsReady).toBe(false);
  });

  it('owns the deadline without Home and shares one controller with every consumer', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(PrivacyProvider, { showError }, children);
    const { result } = renderHook(() => ({
      controller: usePrivacyController(),
      first: usePrivacyMode({ showError }),
      second: usePrivacyMode({ showError }),
    }), { wrapper });
    await act(async () => {});
    expect(result.current.first).toBe(result.current.controller);
    expect(result.current.second).toBe(result.current.controller);
    expect(RN.__appStateListeners).toHaveLength(1);
    expect(historyPrivacyIsReady()).toBe(true);
    expect(historyIsLocked()).toBe(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(30000); });
    act(recordHistoryActivity);
    await act(async () => { await jest.advanceTimersByTimeAsync(59000); });
    expect(historyIsLocked()).toBe(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(historyIsLocked()).toBe(true);
  });

  it('cannot let an older disabled-settings read override a newer enabled lock', async () => {
    const { result } = await renderReady();
    let resolveRead!: (value: string) => void;
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
    settings.privacy_enabled = 'false';
    let first!: Promise<void>;
    act(() => { first = result.current.loadPrivacySettings(); });
    settings.privacy_enabled = 'true';
    settings.privacy_locked = 'true';
    await act(async () => { await result.current.loadPrivacySettings(); });
    await act(async () => { resolveRead('1'); await first; });
    expect(result.current.locked).toBe(true);
    expect(result.current.privacyEnabled).toBe(true);
  });

  it('does not accept a delayed password result after a newer lock', async () => {
    settings.privacy_locked = 'true';
    const { result } = await renderReady();
    authSvc.getCurrentUser.mockReturnValueOnce({ id: 1, username: 'alice' });
    let resolveLogin!: (value: { success: boolean }) => void;
    authSvc.login.mockImplementationOnce(() => new Promise((resolve: any) => { resolveLogin = resolve; }));
    act(() => result.current.setUnlockPassword('pw'));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.handleUnlock(); });
    act(() => result.current.setLocked(true));
    await act(async () => { resolveLogin({ success: true }); await pending; });
    expect(result.current.locked).toBe(true);
    expect(result.current.unlockPassword).toBe('');
  });

  it('keeps a fresh manual lock if a reload sees a stale persisted unlock', async () => {
    const { result } = await renderReady();
    act(() => result.current.setLocked(true));
    await act(async () => { await result.current.loadPrivacySettings(); });
    expect(result.current.locked).toBe(true);
  });

  it('waits for a successful unlock write before a focus reload reads the saved lock', async () => {
    settings.privacy_locked = 'true';
    const { result } = await renderReady();
    let finishWrite!: () => void;
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce((key: string, value: string) => new Promise<void>(resolve => {
      finishWrite = () => { settings[key] = value; resolve(); };
    }));
    await act(async () => { result.current.setLocked(false); });
    let reloading!: Promise<void>;
    await act(async () => { reloading = result.current.loadPrivacySettings(); });
    expect(result.current.settingsReady).toBe(false);
    await act(async () => { finishWrite(); await reloading; });
    expect(result.current.settingsReady).toBe(true);
    expect(result.current.locked).toBe(false);
  });

  it('blocks history while inactive and restores an already locked screen on active', async () => {
    settings.privacy_locked = 'true';
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(PrivacyProvider, { showError }, children);
    const { result } = renderHook(usePrivacyController, { wrapper });
    await act(async () => {});
    act(() => { for (const cb of RN.__appStateListeners) cb('inactive'); });
    expect(result.current!.settingsReady).toBe(false);
    expect(historyPrivacyIsReady()).toBe(false);
    await act(async () => { for (const cb of RN.__appStateListeners) cb('active'); });
    expect(result.current!.settingsReady).toBe(true);
    expect(result.current!.locked).toBe(true);
  });

  it('allows Face ID through its inactive transition without revealing history before active', async () => {
    settings.privacy_locked = 'true';
    const { result } = await renderReady();
    let resolveAuth!: (value: { success: boolean }) => void;
    (LocalAuthentication.authenticateAsync as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveAuth = resolve; }));
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.handleBiometricUnlock(); });
    act(() => { for (const cb of RN.__appStateListeners) cb('inactive'); });
    await act(async () => { resolveAuth({ success: true }); await pending; });
    expect(result.current.settingsReady).toBe(false);
    expect(result.current.locked).toBe(false);
    settings.privacy_locked = 'false';
    await act(async () => { for (const cb of RN.__appStateListeners) cb('active'); });
    expect(result.current.settingsReady).toBe(true);
    expect(result.current.locked).toBe(false);
  });

  it('locks safely when settings cannot be read', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));
    const { result } = await renderReady();
    expect(result.current.locked).toBe(true);
    expect(result.current.privacyEnabled).toBe(true);
  });

  it('does not extend the inactivity deadline just by backgrounding', async () => {
    const started = Date.now();
    await renderReady();
    await act(async () => { await jest.advanceTimersByTimeAsync(30000); });
    await act(async () => { for (const cb of RN.__appStateListeners) await cb('background'); });
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('privacy_last_active', String(started));
  });

  it('blocks content synchronously while foreground settings are being checked', async () => {
    const { result } = await renderReady();
    let resolveRead!: (value: string) => void;
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
    act(() => { for (const cb of RN.__appStateListeners) void cb('active'); });
    expect(result.current.settingsReady).toBe(false);
    await act(async () => {});
    await act(async () => { resolveRead('1'); });
    expect(result.current.settingsReady).toBe(true);
  });

  it('does not let activity revive an expired deadline before the next tick', async () => {
    const { result } = await renderReady();
    jest.setSystemTime(Date.now() + 61000);
    act(() => result.current.resetPrivacyTimer());
    expect(result.current.locked).toBe(true);
  });

  it('ignores a biometric result after the account changes', async () => {
    setSession('https://one.example', 'alice');
    settings.privacy_locked = 'true';
    let resolveAuth!: (value: { success: boolean }) => void;
    (LocalAuthentication.authenticateAsync as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveAuth = resolve; }));
    const { result } = await renderReady();
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.handleBiometricUnlock(); });
    await act(async () => { setSession('https://one.example', 'bob'); });
    await act(async () => { resolveAuth({ success: true }); await pending; });
    expect(result.current.locked).toBe(true);
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith('privacy_locked', 'false');
  });

  it('ignores a biometric result after a newer manual lock', async () => {
    settings.privacy_locked = 'true';
    let resolveAuth!: (value: { success: boolean }) => void;
    (LocalAuthentication.authenticateAsync as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveAuth = resolve; }));
    const { result } = await renderReady();
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.handleBiometricUnlock(); });
    act(() => result.current.setLocked(true));
    await act(async () => { resolveAuth({ success: true }); await pending; });
    expect(result.current.locked).toBe(true);
  });
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

describe('startup and countdown recovery', () => {
  it('carries unexpired elapsed time from the previous session into the countdown', async () => {
    settings.privacy_last_active = String(Date.now() - 10000);
    const { result } = await renderReady();
    expect(result.current.locked).toBe(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    // 10s elapsed at mount + 1s interval tick = 11s of a 60s budget.
    expect(result.current.privacySeconds).toBe(49);
  });

  it('stops polling storage once locked', async () => {
    const { result } = await renderReady();
    await act(async () => { await jest.advanceTimersByTimeAsync(61000); });
    expect(result.current.locked).toBe(true);
    (AsyncStorage.getItem as jest.Mock).mockClear();
    await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it('applies stored display flags and falls back to the default timeout', async () => {
    delete settings.privacy_timeout_minutes;
    settings.show_privacy_countdown = 'false';
    settings.privacy_allow_compose = 'false';
    const { result } = await renderReady();
    expect(result.current.showCountdown).toBe(false);
    expect(result.current.allowComposeWhenLocked).toBe(false);

    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    // No stored timeout: the default 5-minute budget applies.
    expect(result.current.privacySeconds).toBe(299);
  });

  it('picks up setting changes on the next poll', async () => {
    const { result } = await renderReady();
    expect(result.current.privacyEnabled).toBe(true);
    expect(result.current.allowComposeWhenLocked).toBe(true);
    settings.privacy_enabled = 'false';
    settings.privacy_allow_compose = 'false';
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(result.current.privacyEnabled).toBe(false);
    expect(result.current.allowComposeWhenLocked).toBe(false);
    expect(result.current.privacySeconds).toBeNull();
  });

  it('works without an onLockChange callback', async () => {
    settings.privacy_locked = 'true';
    const first = renderHook(() => usePrivacyMode({ showError }));
    await act(async () => {});
    expect(first.result.current.settingsReady).toBe(true);
    expect(first.result.current.locked).toBe(true);
    first.unmount();

    delete settings.privacy_locked;
    delete settings.privacy_timeout_minutes;
    settings.privacy_last_active = String(Date.now() - 301000); // past the 5-minute default
    const second = renderHook(() => usePrivacyMode({ showError }));
    await act(async () => {});
    expect(second.result.current.locked).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_locked', 'true');
  });
});

describe('keyboard animation listeners', () => {
  it('springs the lock keyboard in and out on iOS events', async () => {
    await renderReady();
    expect(RN.Keyboard.addListener).toHaveBeenCalledWith('keyboardWillShow', expect.any(Function));
    expect(RN.Keyboard.addListener).toHaveBeenCalledWith('keyboardWillHide', expect.any(Function));

    const show = RN.__kbListeners.find((l: any) => l.event === 'keyboardWillShow')!.cb;
    const hide = RN.__kbListeners.find((l: any) => l.event === 'keyboardWillHide')!.cb;
    act(() => show({ endCoordinates: { height: 250 } }));
    expect(RN.Animated.spring).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: -100, useNativeDriver: true, speed: 20, bounciness: 0 }),
    );

    act(() => hide());
    expect(RN.Animated.spring).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 0 }),
    );
  });

  it('subscribes to the Android keyboard event names off iOS', async () => {
    RN.__state.os = 'android';
    await renderReady();
    expect(RN.Keyboard.addListener).toHaveBeenCalledWith('keyboardDidShow', expect.any(Function));
    expect(RN.Keyboard.addListener).toHaveBeenCalledWith('keyboardDidHide', expect.any(Function));
  });
});

describe('AppState transitions', () => {
  const fireAppState = async (next: string) => {
    await act(async () => { for (const cb of [...RN.__appStateListeners]) await cb(next); });
  };

  it('stores the activity timestamp when the app leaves the foreground', async () => {
    await renderReady();
    await fireAppState('background');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_last_active', expect.any(String));

    (AsyncStorage.setItem as jest.Mock).mockClear();
    await fireAppState('inactive');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_last_active', expect.any(String));

    (AsyncStorage.setItem as jest.Mock).mockClear();
    await fireAppState('unknown');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('ignores a foreground return while already locked', async () => {
    settings.privacy_locked = 'true';
    const { result } = await renderReady();
    (AsyncStorage.getItem as jest.Mock).mockClear();
    await fireAppState('active');
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(result.current.locked).toBe(true);
  });

  it('skips the foreground lock check when privacy is disabled', async () => {
    settings.privacy_enabled = 'false';
    await renderReady();
    await fireAppState('active');
    expect(AsyncStorage.getItem).not.toHaveBeenCalledWith('privacy_last_active');
  });

  it('locks when the backgrounded app stayed away past the timeout', async () => {
    const { result } = await renderReady();
    expect(result.current.locked).toBe(false);
    settings.privacy_last_active = String(Date.now() - 61000);
    await fireAppState('active');
    expect(result.current.locked).toBe(true);
    expect(onLockChange).toHaveBeenLastCalledWith(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_locked', 'true');
  });

  it('reflects elapsed background time on an unexpired foreground return', async () => {
    delete settings.privacy_timeout_minutes;
    const { result } = await renderReady();
    settings.privacy_last_active = String(Date.now() - 20000);
    await fireAppState('active');
    expect(result.current.locked).toBe(false); // 20s is well within the 5-minute default
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    // 20s elapsed in the background + 1s interval tick = 21s of a 300s budget.
    expect(result.current.privacySeconds).toBe(279);
    expect(result.current.locked).toBe(false);
  });

  it('does nothing on a foreground return without a saved timestamp', async () => {
    delete settings.privacy_timeout_minutes;
    const { result } = await renderReady();
    await fireAppState('active');
    expect(result.current.locked).toBe(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(result.current.locked).toBe(false);
    expect(result.current.privacySeconds).toBe(299);
  });
});

describe('biometric availability', () => {
  it('keeps biometrics available after the user falls back to the password', async () => {
    settings.privacy_locked = 'true';
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: false, error: 'user_fallback' });
    const { result } = await renderReady();
    expect(result.current.biometricAvailable).toBe(true);
    await act(async () => { await result.current.handleBiometricUnlock(); });
    expect(result.current.biometricAvailable).toBe(true);
  });

  it.each(['unknown', 'authentication_error'])('disables biometrics after %s', async (error) => {
    settings.privacy_locked = 'true';
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: false, error });
    const { result } = await renderReady();
    let status: string | undefined;
    await act(async () => { status = await result.current.handleBiometricUnlock(); });
    expect(status).toBe('password');
    expect(result.current.biometricAvailable).toBe(false);
  });

  it('disables biometrics when authentication throws', async () => {
    settings.privacy_locked = 'true';
    (LocalAuthentication.authenticateAsync as jest.Mock).mockRejectedValue(new Error('传感器故障'));
    const { result } = await renderReady();
    let status: string | undefined;
    await act(async () => { status = await result.current.handleBiometricUnlock(); });
    expect(status).toBe('password');
    expect(result.current.biometricAvailable).toBe(false);
  });

  it('logs and stays unavailable when hardware detection fails', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockRejectedValueOnce(new Error('no hw'));
    const { result } = await renderReady();
    expect(result.current.biometricAvailable).toBe(false);
    expect(logError).toHaveBeenCalledWith(expect.any(Error), 'biometric detection');
  });
});

describe('password unlock', () => {
  const renderLocked = () => { settings.privacy_locked = 'true'; return renderReady(); };

  it('does nothing without an entered password', async () => {
    const { result } = await renderLocked();
    await act(async () => { await result.current.handleUnlock(); });
    expect(authSvc.login).not.toHaveBeenCalled();
    expect(result.current.locked).toBe(true);
    expect(result.current.unlocking).toBe(false);
  });

  it('reports a missing cached user profile', async () => {
    const { result } = await renderLocked();
    authSvc.getCurrentUser.mockReturnValueOnce(null);
    act(() => result.current.setUnlockPassword('pw'));
    await act(async () => { await result.current.handleUnlock(); });
    expect(showError).toHaveBeenCalledWith('错误', '用户信息丢失');
    expect(authSvc.login).not.toHaveBeenCalled();
    expect(result.current.unlocking).toBe(false);
  });

  it('unlocks and clears the password after a successful login', async () => {
    const { result } = await renderLocked();
    authSvc.getCurrentUser.mockReturnValueOnce({ id: 1, username: 'alice' });
    authSvc.login.mockResolvedValueOnce({ success: true });
    act(() => result.current.setUnlockPassword('pw'));
    await act(async () => { await result.current.handleUnlock(); });
    expect(authSvc.login).toHaveBeenCalledWith('alice', 'pw', { unlockPrivacy: false });
    expect(result.current.locked).toBe(false);
    expect(result.current.unlockPassword).toBe('');
    expect(result.current.unlocking).toBe(false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_locked', 'false');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_last_active', expect.any(String));
  });

  it.each([
    ['server message', { success: false, error: '密码错误' }, '密码错误'],
    ['no message', { success: false }, '密码错误，请重试'],
  ])('shows the unlock failure with %s', async (_name, loginResult, expected) => {
    const { result } = await renderLocked();
    authSvc.getCurrentUser.mockReturnValueOnce({ id: 1, username: 'alice' });
    authSvc.login.mockResolvedValueOnce(loginResult);
    act(() => result.current.setUnlockPassword('pw'));
    await act(async () => { await result.current.handleUnlock(); });
    expect(showError).toHaveBeenCalledWith('解锁失败', expected);
    expect(result.current.locked).toBe(true);
    expect(result.current.unlockPassword).toBe('');
    expect(result.current.unlocking).toBe(false);
  });

  it.each([
    ['its message', new Error('连接超时'), '连接超时'],
    ['an empty message', new Error(''), '网络错误，请重试'],
    ['a non-error rejection', undefined, '网络错误，请重试'],
  ])('surfaces a thrown login error with %s', async (_name, err, expected) => {
    const { result } = await renderLocked();
    authSvc.getCurrentUser.mockReturnValueOnce({ id: 1, username: 'alice' });
    authSvc.login.mockRejectedValueOnce(err);
    act(() => result.current.setUnlockPassword('pw'));
    await act(async () => { await result.current.handleUnlock(); });
    expect(showError).toHaveBeenCalledWith('解锁失败', expected);
    expect(result.current.locked).toBe(true);
    expect(result.current.unlocking).toBe(false);
  });
});
