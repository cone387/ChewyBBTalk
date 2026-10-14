import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Animated, AppState, Keyboard, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { logError } from '../utils/errorHandler';
import { getSession, isCurrentSession, onSessionChange } from '../services/session';
import { onHistoryActivity, setHistoryLocked, setHistoryPrivacyReady, setHistoryPrivacySuspended, setHistoryPrivacyResumePending } from '../services/historyPrivacy';
import { getDeviceLockState, onDeviceLock } from '../services/nativePrivacy';
import { subscribePrivacyPreferences } from '../services/privacyPreferences';
import { PrivacyContext, usePrivacyController } from './privacyContext';
export { usePrivacyController } from './privacyContext';

export type BiometricUnlockResult = 'unlocked' | 'cancelled' | 'password';
export interface UsePrivacyModeReturn {
  settingsReady: boolean;
  settingsError: boolean;
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
async function boundedRead<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Privacy settings timed out')), 3000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** One controller belongs to the authenticated app, including direct/deep-linked screens. */
export function PrivacyProvider({ children, showError, authenticatedThisLaunch = false }: React.PropsWithChildren<UsePrivacyModeOptions & { authenticatedThisLaunch?: boolean }>) {
  const controller = useOwnedPrivacyMode({ showError }, true, true, authenticatedThisLaunch);
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

function useOwnedPrivacyMode(options: UsePrivacyModeOptions, active: boolean, publish: boolean, authenticatedThisLaunch = false): UsePrivacyModeReturn {
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
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
  const initialAuthentication = useRef(authenticatedThisLaunch);
  const isLocked = useRef(true);
  const enabledRef = useRef(true);
  const lockOnDeviceLock = useRef(true);
  const deviceRevision = useRef<number | null>(null);
  const deviceLocked = useRef(false);
  const deviceLockedDuringStartup = useRef(false);
  const foregroundVersion = useRef(0);
  const lastActivity = useRef(Date.now());
  const timeoutMins = useRef(5);
  const requestVersion = useRef(0);
  const authVersion = useRef(0);
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
    applyLock(value);
    setUnlocking(false);
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

  const readSettings = useCallback(async () => {
    const version = ++requestVersion.current;
    const session = getSession();
    const firstLoad = !initialized.current;
    try {
      const [t, c, e, ac, launch, device, savedLock, saved] = await boundedRead(Promise.all([
        AsyncStorage.getItem('privacy_timeout_minutes'), AsyncStorage.getItem('show_privacy_countdown'),
        AsyncStorage.getItem('privacy_enabled'), AsyncStorage.getItem('privacy_allow_compose'),
        AsyncStorage.getItem('privacy_lock_on_launch'), AsyncStorage.getItem('privacy_lock_on_device_lock'),
        firstLoad ? AsyncStorage.getItem('privacy_locked') : Promise.resolve(null),
        firstLoad ? AsyncStorage.getItem('privacy_last_active') : Promise.resolve(null),
      ]));
      if (!mounted.current || version !== requestVersion.current || !isCurrentSession(session)) return;
      const minutes = Number(t || 5);
      timeoutMins.current = Number.isFinite(minutes) ? Math.min(60, Math.max(1, minutes)) : 5;
      enabledRef.current = e !== 'false';
      lockOnDeviceLock.current = device !== 'false';
      setSettingsError(false);
      setPrivacyEnabled(enabledRef.current);
      setShowCountdown(c !== 'false');
      setAllowComposeWhenLocked(ac !== 'false');
      if (!enabledRef.current) {
        applyLock(false);
        setPrivacySeconds(null);
      } else if (firstLoad) {
        if (initialAuthentication.current) {
          // A password login completed this launch already proved the user's identity.
          lastActivity.current = Date.now();
          persist('privacy_last_active', String(lastActivity.current));
        } else if (saved !== null) {
          const timestamp = Number(saved);
          lastActivity.current = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
        }
        const mustLock = (!initialAuthentication.current && (launch !== 'false' || savedLock === 'true' || expired()))
          || (lockOnDeviceLock.current && (deviceLocked.current || deviceLockedDuringStartup.current));
        applyLock(mustLock);
        if (mustLock || initialAuthentication.current) persist('privacy_locked', String(mustLock));
      }
      if (enabledRef.current && lockOnDeviceLock.current && deviceLocked.current) applyLock(true);
      if (enabledRef.current && !isLocked.current) {
        if (expired()) { applyLock(true); persist('privacy_locked', 'true'); }
        else setPrivacySeconds(Math.ceil((timeoutMins.current * 60000 - (Date.now() - lastActivity.current)) / 1000));
      }
    } catch (error) {
      if (!mounted.current || version !== requestVersion.current || !isCurrentSession(session)) return;
      enabledRef.current = true;
      setSettingsError(true);
      setPrivacyEnabled(true);
      applyLock(true);
      logError(error, 'privacy settings');
    } finally {
      if (mounted.current && version === requestVersion.current && isCurrentSession(session)) {
        initialized.current = true;
        initialAuthentication.current = false;
        ready(true);
      }
    }
  }, [applyLock, expired, persist, ready]);
  const loadPrivacySettings = useCallback(() => readSettings(), [readSettings]);

  const observeDeviceLock = useCallback((state: { revision: number; locked: boolean; supported: boolean }) => {
    if (!mounted.current || !state.supported) return;
    // A revision catches a lock/unlock cycle whose event happened while JS was suspended.
    const newerLock = deviceRevision.current !== null && state.revision > deviceRevision.current;
    if (deviceRevision.current !== null && state.revision < deviceRevision.current) return;
    deviceRevision.current = state.revision;
    deviceLocked.current = state.locked;
    if (enabledRef.current && lockOnDeviceLock.current && (state.locked || newerLock)) {
      if (readyRef.current) setLocked(true);
      else { deviceLockedDuringStartup.current = true; authVersion.current += 1; applyLock(true); }
    }
  }, [applyLock, setLocked]);

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
    } finally { if (current()) setUnlocking(false); }
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
    } finally { if (current()) setUnlocking(false); }
  }, [unlockPassword, setLocked]);

  useEffect(() => {
    if (!active) return;
    mounted.current = true;
    void loadPrivacySettings();
    const initialSession = getSession();
    void boundedRead(getDeviceLockState()).then(state => {
      if (isCurrentSession(initialSession)) observeDeviceLock(state);
    }).catch(error => { logError(error, 'device lock state'); });
    const stopDeviceLock = onDeviceLock(observeDeviceLock);
    const stopPreferences = subscribePrivacyPreferences(() => { void loadPrivacySettings(); });
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
      if (enabledRef.current) setPrivacySeconds(Math.ceil((timeoutMins.current * 60000 - (Date.now() - lastActivity.current)) / 1000));
    }, 1000);
    const appState = AppState.addEventListener('change', next => {
      if (next === 'background' || next === 'inactive') {
        backgrounded.current = true;
        foregroundVersion.current += 1;
        if (publish) setHistoryPrivacyResumePending(false);
        // Opening the app switcher is not activity and must not extend the deadline.
        persist('privacy_last_active', String(lastActivity.current));
        if (next === 'background') {
          authVersion.current += 1;
          setUnlocking(false);
          if (publish) setHistoryPrivacySuspended(true);
        }
      } else if (next === 'active') {
        backgrounded.current = false;
        if (publish) setHistoryPrivacyResumePending(true);
        if (readyRef.current && enabledRef.current && !isLocked.current && expired()) setLocked(true);
        const version = ++foregroundVersion.current;
        const session = getSession();
        const current = () => mounted.current && version === foregroundVersion.current && isCurrentSession(session);
        void boundedRead(getDeviceLockState()).then(state => {
          if (current()) observeDeviceLock(state);
        }).catch(error => {
          if (current() && enabledRef.current && lockOnDeviceLock.current) setLocked(true);
          logError(error, 'device lock state');
        }).finally(() => {
          if (current() && publish) {
            setHistoryPrivacySuspended(false);
            setHistoryPrivacyResumePending(false);
          }
        });
      }
    });
    const stopSession = onSessionChange(() => {
      initialAuthentication.current = false;
      // Even an account switch during startup must never restore the previous unlock.
      initialized.current = true;
      requestVersion.current += 1;
      authVersion.current += 1;
      foregroundVersion.current += 1;
      if (publish) setHistoryPrivacyResumePending(false);
      ready(false);
      applyLock(true);
      setUnlockPassword('');
      setUnlocking(false);
      // Read configuration only: a new account never inherits the old account's unlock.
      const session = getSession();
      void readSettings().then(() => { if (mounted.current && isCurrentSession(session)) ready(true); });
    });
    const stopActivity = publish ? onHistoryActivity(resetPrivacyTimer) : () => {};
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      authVersion.current += 1;
      foregroundVersion.current += 1;
      clearInterval(timer); kbShow.remove(); kbHide.remove(); appState.remove(); stopSession(); stopActivity(); stopDeviceLock(); stopPreferences();
      if (publish) { setHistoryPrivacyReady(false); setHistoryLocked(true); setHistoryPrivacySuspended(false); setHistoryPrivacyResumePending(false); }
    };
  }, [active, applyLock, expired, loadPrivacySettings, lockKeyboardH, observeDeviceLock, persist, publish, readSettings, ready, resetPrivacyTimer, setLocked]);
  useEffect(() => { if (active && settingsReady) optionsRef.current.onLockChange?.(locked); }, [active, locked, settingsReady]);
  return { settingsReady, settingsError, locked, privacyEnabled, privacySeconds, showCountdown, biometricAvailable,
    allowComposeWhenLocked, unlockPassword, unlocking, lockKeyboardH, setLocked, setUnlockPassword,
    resetPrivacyTimer, handleBiometricUnlock, handleUnlock, loadPrivacySettings };
}
