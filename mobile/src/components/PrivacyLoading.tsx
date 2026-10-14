import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export default function PrivacyLoading({ onRetry }: { onRetry?: () => void }) {
  const { theme: { colors: c } } = useTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background, padding: 24 }}>
    {onRetry ? <>
      <Text accessibilityRole="alert" style={{ color: c.text }}>暂时无法读取防窥设置，内容已锁定</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onRetry} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text style={{ color: c.primary }}>重新读取设置</Text>
      </TouchableOpacity>
    </> : <><ActivityIndicator color={c.primary} /><Text style={{ color: c.textSecondary, marginTop: 12 }}>正在准备私人空间…</Text></>}
  </View>;
}
