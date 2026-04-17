import { useState, useCallback, useRef, useEffect } from 'react';
import { Animated, Keyboard, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

import { logError } from '../utils/errorHandler';

export interface UsePrivacyModeReturn {
  // 状态
  locked: boolean;
  privacyEnabled: boolean;
  privacySeconds: number | null;
  showCountdown: boolean;
  biometricAvailable: boolean;
  allowComposeWhenLocked: boolean;
  unlockPassword: string;
  unlocking: boolean;
  lockKeyboardH: Animated.Value;

  // 操作
  setLocked: (val: boolean) => void;
  setUnlockPassword: (val: string) => void;
  resetPrivacyTimer: () => void;
  handleBiometricUnlock: () => Promise<void>;
  handleUnlock: () => Promise<void>;
  loadPrivacySettings: () => Promise<void>;
}

interface UsePrivacyModeOptions {
  onLockChange?: (locked: boolean) => void;
  showError: (title: string, msg: string) => void;
}

export function usePrivacyMode(options: UsePrivacyModeOptions): UsePrivacyModeReturn {
  const { showError } = options;

  // --- State ---
  const [privacySeconds, setPrivacySeconds] = useState<number | null>(null);
  const [showCountdown, setShowCountdown] = useState(true);
  const [privacyEnabled, setPrivacyEnabled] = useState(true);
  const [locked, setLockedState] = useState(false);
  const [allowComposeWhenLocked, setAllowComposeWhenLocked] = useState(true);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // --- Refs ---
  const lockKeyboardH = useRef(new Animated.Value(0)).current;
  const lastActivity = useRef(Date.now());
  const timeoutMinsRef = useRef(5);
  const onLockChangeRef = useRef(options.onLockChange);
  onLockChangeRef.current = options.onLockChange;

  // --- Callbacks ---
  const setLocked = useCallback((val: boolean) => {
    setLockedState(val);
    AsyncStorage.setItem('privacy_locked', val ? 'true' : 'false');
  }, []);

  const resetPrivacyTimer = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const loadPrivacySettings = useCallback(async () => {
    const t = await AsyncStorage.getItem('privacy_timeout_minutes');
    if (t) timeoutMinsRef.current = parseInt(t, 10);
    const cVal = await AsyncStorage.getItem('show_privacy_countdown');
    setShowCountdown(prev => { const v = cVal !== 'false'; return prev === v ? prev : v; });
    const e = await AsyncStorage.getItem('privacy_enabled');
    const enabled = e !== 'false';
    setPrivacyEnabled(prev => prev === enabled ? prev : enabled);
    const ac = await AsyncStorage.getItem('privacy_allow_compose');
    setAllowComposeWhenLocked(prev => { const v = ac !== 'false'; return prev === v ? prev : v; });
    // 恢复锁定状态 - 仅在防窥明确启用时
    if (enabled) {
      const l = await AsyncStorage.getItem('privacy_locked');
      if (l === 'true') { setLockedState(true); onLockChangeRef.current?.(true); }
      else { lastActivity.current = Date.now(); }
    } else {
      lastActivity.current = Date.now();
    }
  }, []);

  const handleBiometricUnlock = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: '验证身份以解锁',
        cancelLabel: '使用密码',
        disableDeviceFallback: true,
      });
      if (result.success) {
        setLocked(false);
        setUnlockPassword('');
        lastActivity.current = Date.now();
      } else if (result.error === 'not_enrolled') {
        options.showError('提示', '设备未设置生物识别，请使用密码解锁');
        setBiometricAvailable(false);
      } else if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
        options.showError('提示', '生物识别不可用（Expo Go 不支持 Face ID，需要独立构建），请使用密码解锁');
        setBiometricAvailable(false);
      }
    } catch (e: any) {
      setBiometricAvailable(false);
      options.showError('提示', '生物识别暂不可用，请使用密码解锁');
    }
  }, [setLocked, options.showError]);

  const handleUnlock = useCallback(async () => {
    if (!unlockPassword) return;
    setUnlocking(true);
    try {
      const { login: loginFn, getCurrentUser } = await import('../services/auth');
      const user = getCurrentUser();
      if (!user) { showError('错误', '用户信息丢失'); setUnlocking(false); return; }
      const result = await loginFn(user.username, unlockPassword);
      if (result.success) {
        setLocked(false);
        setUnlockPassword('');
        lastActivity.current = Date.now();
      } else {
        showError('解锁失败', result.error || '密码错误，请重试');
        setUnlockPassword('');
      }
    } catch (e: any) {
      showError('解锁失败', e?.message || '网络错误，请重试');
    } finally {
      setUnlocking(false);
    }
  }, [unlockPassword, setLocked, showError]);

  // --- Effects ---

  // Initial setup: load settings, detect biometrics, keyboard animation, 1-second interval timer
  useEffect(() => {
    loadPrivacySettings();

    // 检测生物识别
    (async () => {
      try {
        const hasHw = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(hasHw && enrolled);
      } catch (e) { logError(e, 'biometric detection'); }
    })();

    // 锁屏键盘动画
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const kbShow = Keyboard.addListener(showEvent, (e) => {
      Animated.spring(lockKeyboardH, { toValue: -e.endCoordinates.height / 2.5, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
    });
    const kbHide = Keyboard.addListener(hideEvent, () => {
      Animated.spring(lockKeyboardH, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
    });

    // 1-second interval timer for privacy countdown
    const isLockedRef = { current: false };
    const timer = setInterval(async () => {
      // 已锁定时不再轮询，减少重渲染
      if (isLockedRef.current) return;

      const t = await AsyncStorage.getItem('privacy_timeout_minutes');
      if (t) timeoutMinsRef.current = parseInt(t, 10);
      const e = await AsyncStorage.getItem('privacy_enabled');
      const enabled = e !== 'false';
      setPrivacyEnabled(prev => prev === enabled ? prev : enabled);

      const ac = await AsyncStorage.getItem('privacy_allow_compose');
      const allowVal = ac !== 'false';
      setAllowComposeWhenLocked(prev => prev === allowVal ? prev : allowVal);

      if (!enabled) { setPrivacySeconds(null); return; }

      const elapsed = (Date.now() - lastActivity.current) / 1000;
      const remaining = timeoutMinsRef.current * 60 - elapsed;
      if (remaining <= 0) {
        setPrivacySeconds(0);
        setLocked(true);
        isLockedRef.current = true;
      } else {
        setPrivacySeconds(Math.ceil(remaining));
      }
    }, 1000);

    return () => { clearInterval(timer); kbShow.remove(); kbHide.remove(); };
  }, []);

  // 通知父组件锁定状态变化
  useEffect(() => { onLockChangeRef.current?.(locked); }, [locked]);

  return {
    locked,
    privacyEnabled,
    privacySeconds,
    showCountdown,
    biometricAvailable,
    allowComposeWhenLocked,
    unlockPassword,
    unlocking,
    lockKeyboardH,

    setLocked,
    setUnlockPassword,
    resetPrivacyTimer,
    handleBiometricUnlock,
    handleUnlock,
    loadPrivacySettings,
  };
}
