import React, { useRef, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePrivacyController } from '../hooks/usePrivacyMode';
import { historyIsLocked, historyPrivacyIsReady, subscribeHistoryPrivacy, recordHistoryActivity } from '../services/historyPrivacy';
import { useTheme } from '../theme/ThemeContext';
import PrivacyLockOverlay from './PrivacyLockOverlay';
import PrivacyLoading from './PrivacyLoading';

/** All authenticated stack destinations share the same in-place unlock gate. */
export default function PrivacyBoundary({ children, preserveState = false }: React.PropsWithChildren<{ preserveState?: boolean }>) {
  const privacy = usePrivacyController();
  const locked = useSyncExternalStore(subscribeHistoryPrivacy, historyIsLocked, historyIsLocked);
  const ready = useSyncExternalStore(subscribeHistoryPrivacy, historyPrivacyIsReady, historyPrivacyIsReady);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const opened = useRef(false);
  const allowed = ready && !locked;
  if (allowed) opened.current = true;
  return <View style={{ flex: 1, backgroundColor: theme.colors.background }} onTouchStart={recordHistoryActivity}>
    {(allowed || (preserveState && opened.current)) && <View
      style={{ flex: 1, display: allowed ? 'flex' : 'none' }}
      accessibilityElementsHidden={!allowed} importantForAccessibility={allowed ? 'auto' : 'no-hide-descendants'}>
      {children}
    </View>}
    {privacy?.settingsError ? <PrivacyLoading onRetry={() => { void privacy.loadPrivacySettings(); }} /> : !ready ? <PrivacyLoading /> : !allowed && privacy && <PrivacyLockOverlay
      locked biometricAvailable={privacy.biometricAvailable} allowComposeWhenLocked={false}
      unlockPassword={privacy.unlockPassword} unlocking={privacy.unlocking} lockKeyboardH={privacy.lockKeyboardH}
      onUnlockPasswordChange={privacy.setUnlockPassword} onUnlock={privacy.handleUnlock}
      onBiometricUnlock={privacy.handleBiometricUnlock} onCompose={() => {}} onVoiceRecord={() => {}}
      bottomInset={insets.bottom} theme={theme} />}
  </View>;
}

export function protectScreen<P extends object>(Screen: React.ComponentType<P>, preserveState = false) {
  return function ProtectedScreen(props: P) {
    return <PrivacyBoundary preserveState={preserveState}><Screen {...props} /></PrivacyBoundary>;
  };
}
