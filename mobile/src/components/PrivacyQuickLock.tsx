import React from 'react';
import { Keyboard, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePrivacyController } from '../hooks/privacyContext';
import { useTheme } from '../theme/ThemeContext';

/** A toolbar action independent of the optional countdown badge. */
export default function PrivacyQuickLock({ color }: { color?: string }) {
  const privacy = usePrivacyController();
  const { theme } = useTheme();
  if (!privacy?.settingsReady || privacy.locked || !privacy.privacyEnabled) return null;
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel="立即锁定私人内容"
    accessibilityHint="隐藏历史内容，再次查看需要验证身份"
    style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
    onPress={() => { Keyboard.dismiss(); privacy.setLocked(true); }}>
    <Ionicons name="lock-closed-outline" size={20} color={color || theme.colors.textSecondary} />
  </TouchableOpacity>;
}
