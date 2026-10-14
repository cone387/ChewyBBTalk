import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Animated, AppState, Keyboard, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { logError } from '../utils/errorHandler';
import { getSession, isCurrentSession, onSessionChange } from '../services/session';
import { onHistoryActivity, setHistoryLocked, setHistoryPrivacyReady } from '../services/historyPrivacy';

export type BiometricUnlockResult = 'unlocked' | 'cancelled' | 'password';
export interface UsePrivacyModeReturn {
  settingsReady: boolean;
  locked: boolean;
  privacyEnabled: boolean;
  privacySeconds: number | null;
  showCountdown: boolean;
  biometricAvailable: boolean;
  allowComposeWhenLocked: boolean;
  unlockPassword: string;
  unlocking: boolean;
  lockKeyboardH: Animated.Value;
  setLocked: (val: boolean) => void;
  setUnlockPassword: (val: string) => void;
  resetPrivacyTimer: () => void;
  handleBiometricUnlock: () => Promise<BiometricUnlockResult>;
  handleUnlock: () => Promise<void>;
  loadPrivacySettings: () => Promise<void>;
}
interface UsePrivacyModeOptions {
  onLockChange?: (locked: boolean) => void;
  showError: (title: string, msg: string) => void;
}
const PrivacyContext = createContext<UsePrivacyModeReturn | null>(null);
export const usePrivacyController = () => useContext(PrivacyContext);

/** One controller belongs to the authenticated app, including direct/deep-linked screens. */
export function PrivacyProvider({ children, showError }: React.PropsWithChildren<UsePrivacyModeOptions>) {
  const controller = useOwnedPrivacyMode({ showError }, true, true);
  return React.createElement(PrivacyContext.Provider, { value: controller }, children);
}
export function usePrivacyMode(options: UsePrivacyModeOptions): UsePrivacyModeReturn {
  const shared = usePrivacyController();
  // A provider prevents duplicate timers/listeners; standalone screens remain usable.
  const local = useOwnedPrivacyMode(options, !shared, false);
  const controller = shared || local;
  const callback = useRef(options.onLockChange);
  callback.current = options.onLockChange;
  const isShared = !!shared;
  useEffect(() => {
    if (isShared && controller.settingsReady) callback.current?.(controller.locked);
  }, [isShared, controller.settingsReady, controller.locked]);
  return controller;
}

function useOwnedPrivacyMode(options: UsePrivacyModeOptions, active: boolean, publish: boolean): UsePrivacyModeReturn {
  const [settingsReady, setSettingsReady] = useState(false);
  const [locked, setLockedState] = useState(true);
  const [privacyEnabled, setPrivacyEnabled] = useState(true);
  const [privacySeconds, setPrivacySeconds] = useState<number | null>(null);
  const [showCountdown, setShowCountdown] = useState(true);
  const [allowComposeWhenLocked, setAllowComposeWhenLocked] = useState(true);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const lockKeyboardH = useRef(new Animated.Value(0)).current;
  const mounted = useRef(false);
  const readyRef = useRef(false);
  const initialized = useRef(false);
  const isLocked = useRef(true);
  const enabledRef = useRef(true);
  const lastActivity = useRef(Date.now());
  const timeoutMins = useRef(5);
  const requestVersion = useRef(0);
  const authVersion = useRef(0);
  const reading = useRef(false);
  const writeQueue = useRef(Promise.resolve());
  const backgrounded = useRef(AppState.currentState === 'inactive' || AppState.currentState === 'background');
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const ready = useCallback((value: boolean) => {
    readyRef.current = value;
    if (publish) setHistoryPrivacyReady(value);
    setSettingsReady(value);
  }, [publish]);
  const applyLock = useCallback((value: boolean) => {
    isLocked.current = value;
    if (publish) setHistoryLocked(value);
    setLockedState(value);
  }, [publish]);
  const persist = useCallback((key: string, value: string) => {
    const session = getSession();
    const operation = writeQueue.current.then(async () => {
      if (!mounted.current || !isCurrentSession(session)) return;
      await AsyncStorage.setItem(key, value);
    });
    writeQueue.current = operation.catch(error => {
      logError(error, 'privacy persistence');
      if (mounted.current && isCurrentSession(session)) applyLock(true);
    });
  }, [applyLock]);
  const setLocked = useCallback((value: boolean) => {
    authVersion.current += 1;
    requestVersion.current += 1;
    reading.current = false;
    applyLock(value);
    persist('privacy_locked', String(value));
    if (!value) {
      lastActivity.current = Date.now();
      persist('privacy_last_active', String(lastActivity.current));
    } else setUnlockPassword('');
  }, [applyLock, persist]);
  const expired = useCallback(() => {
    const elapsed = Date.now() - lastActivity.current;
    return elapsed < 0 || elapsed >= timeoutMins.current * 60000;
  }, []);
  const resetPrivacyTimer = useCallback(() => {
    if (!readyRef.current || isLocked.current || backgrounded.current) return;
    if (enabledRef.current && expired()) { setLocked(true); return; }
    lastActivity.current = Date.now();
    persist('privacy_last_active', String(lastActivity.current));
  }, [expired, persist, setLocked]);

  const readSettings = useCallback(async (restore: boolean) => {
    const version = ++requestVersion.current;
    const session = getSession();
    if (restore) ready(false);
    reading.current = true;
    try {
      const [t, c, e, ac] = await Promise.all([
        AsyncStorage.getItem('privacy_timeout_minutes'), AsyncStorage.getItem('show_privacy_countdown'),
        AsyncStorage.getItem('privacy_enabled'), AsyncStorage.getItem('privacy_allow_compose'),
      ]);
      if (!mounted.current || version !== requestVersion.current || !isCurrentSession(session)) return;
      const minutes = Number(t || 5);
      timeoutMins.current = Number.isFinite(minutes) ? Math.min(60, Math.max(1, minutes)) : 5;
      enabledRef.current = e !== 'false';
      setPrivacyEnabled(enabledRef.current);
      setShowCountdown(c !== 'false');
      setAllowComposeWhenLocked(ac !== 'false');
      if (!enabledRef.current) {
        applyLock(false);
        setPrivacySeconds(null);
      } else if (restore) {
        // A navigation focus can arrive before the previous unlock/activity write finishes.
        await writeQueue.current;
        if (!mounted.current || version !== requestVersion.current || !isCurrentSession(session)) return;
        const [savedLock, saved] = await Promise.all([
          AsyncStorage.getItem('privacy_locked'), AsyncStorage.getItem('privacy_last_active'),
        ]);
        if (!mounted.current || version !== requestVersion.current || !isCurrentSession(session)) return;
        if (saved !== null) {
          const timestamp = Number(saved);
          lastActivity.current = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
        }
        const mustLock = (initialized.current && isLocked.current) || savedLock === 'true' || expired();
        applyLock(mustLock);
        if (mustLock) persist('privacy_locked', 'true');
      }
      if (enabledRef.current && !isLocked.current) {
        if (expired()) { applyLock(true); persist('privacy_locked', 'true'); }
        else setPrivacySeconds(Math.ceil((timeoutMins.current * 60000 - (Date.now() - lastActivity.current)) / 1000));
      }
    } catch (error) {
      if (!mounted.current || version !== requestVersion.current || !isCurrentSession(session)) return;
      enabledRef.current = true;
      setPrivacyEnabled(true);
      applyLock(true);
      logError(error, 'privacy settings');
    } finally {
      if (mounted.current && version === requestVersion.current && isCurrentSession(session)) {
        initialized.current = true;
        reading.current = false;
        if (restore && !backgrounded.current) ready(true);
      }
    }
  }, [applyLock, expired, persist, ready]);
  const loadPrivacySettings = useCallback(() => readSettings(true), [readSettings]);

  const handleBiometricUnlock = useCallback(async (): Promise<BiometricUnlockResult> => {
    if (!readyRef.current) return 'cancelled';
    const session = getSession();
    const version = ++authVersion.current;
    setUnlocking(true);
    const current = () => mounted.current && isCurrentSession(session) && version === authVersion.current;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: '验证身份以解锁', cancelLabel: '取消', fallbackLabel: '使用密码', disableDeviceFallback: true,
      });
      if (!current()) return 'cancelled';
      if (result.success) { setLocked(false); setUnlockPassword(''); return 'unlocked'; }
      if (['user_cancel', 'system_cancel', 'app_cancel'].includes(result.error)) return 'cancelled';
      if (result.error !== 'user_fallback') setBiometricAvailable(false);
      return 'password';
    } catch {
      if (!current()) return 'cancelled';
      setBiometricAvailable(false);
      return 'password';
    } finally { if (mounted.current) setUnlocking(false); }
  }, [setLocked]);
  const handleUnlock = useCallback(async () => {
    if (!unlockPassword || !readyRef.current) return;
    const session = getSession();
    const version = ++authVersion.current;
    const current = () => mounted.current && isCurrentSession(session) && version === authVersion.current;
    setUnlocking(true);
    try {
      const { login, getCurrentUser } = await import('../services/auth');
      if (!current()) return;
      const user = getCurrentUser();
      if (!user) { optionsRef.current.showError('错误', '用户信息丢失'); return; }
      const result = await login(user.username, unlockPassword, { unlockPrivacy: false });
      if (!current()) return;
      if (result.success) { setLocked(false); setUnlockPassword(''); }
      else { optionsRef.current.showError('解锁失败', result.error || '密码错误，请重试'); setUnlockPassword(''); }
    } catch (error: any) {
      if (current()) optionsRef.current.showError('解锁失败', error?.message || '网络错误，请重试');
    } finally { if (mounted.current) setUnlocking(false); }
  }, [unlockPassword, setLocked]);

  useEffect(() => {
    if (!active) return;
    mounted.current = true;
    void loadPrivacySettings();
    void (async () => {
      try {
        const hw = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (mounted.current) setBiometricAvailable(hw && enrolled);
      } catch (error) { logError(error, 'biometric detection'); }
    })();
    const kbShow = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => {
      Animated.spring(lockKeyboardH, { toValue: -e.endCoordinates.height / 2.5, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
    });
    const kbHide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      Animated.spring(lockKeyboardH, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
    });
    const timer = setInterval(() => {
      if (!readyRef.current || isLocked.current || backgrounded.current) return;
      if (enabledRef.current && expired()) { setPrivacySeconds(0); setLocked(true); return; }
      if (!reading.current) void readSettings(false);
    }, 1000);
    const appState = AppState.addEventListener('change', next => {
      if (next === 'background' || next === 'inactive') {
        backgrounded.current = true;
        ready(false);
        // Opening the app switcher is not activity and must not extend the deadline.
        persist('privacy_last_active', String(lastActivity.current));
        if (next === 'background') authVersion.current += 1;
      } else if (next === 'active') {
        backgrounded.current = false;
        if (isLocked.current) ready(true);
        else {
          ready(false);
          // Finish our own ordered persistence before restoring the foreground deadline.
          const session = getSession();
          void writeQueue.current.then(() => {
            if (mounted.current && !backgrounded.current && isCurrentSession(session)) return loadPrivacySettings();
          });
        }
      }
    });
    const stopSession = onSessionChange(() => {
      requestVersion.current += 1;
      authVersion.current += 1;
      reading.current = false;
      ready(false);
      applyLock(true);
      setUnlockPassword('');
      setUnlocking(false);
      // Read configuration only: a new account never inherits the old account's unlock.
      const session = getSession();
      void readSettings(false).then(() => { if (mounted.current && !backgrounded.current && isCurrentSession(session)) ready(true); });
    });
    const stopActivity = publish ? onHistoryActivity(resetPrivacyTimer) : () => {};
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      authVersion.current += 1;
      clearInterval(timer); kbShow.remove(); kbHide.remove(); appState.remove(); stopSession(); stopActivity();
      if (publish) { setHistoryPrivacyReady(false); setHistoryLocked(true); }
    };
  }, [active, applyLock, expired, loadPrivacySettings, lockKeyboardH, persist, publish, readSettings, ready, resetPrivacyTimer, setLocked]);
  useEffect(() => { if (active && settingsReady) optionsRef.current.onLockChange?.(locked); }, [active, locked, settingsReady]);
  return { settingsReady, locked, privacyEnabled, privacySeconds, showCountdown, biometricAvailable,
    allowComposeWhenLocked, unlockPassword, unlocking, lockKeyboardH, setLocked, setUnlockPassword,
    resetPrivacyTimer, handleBiometricUnlock, handleUnlock, loadPrivacySettings };
}
