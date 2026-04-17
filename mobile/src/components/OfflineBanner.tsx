import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../theme/ThemeContext';
import { formatRelativeTime } from '../utils/formatRelativeTime';

export interface OfflineBannerProps {
  isOffline: boolean;
  lastSyncTime: string | null;
  theme: Theme;
}

/**
 * OfflineBanner — 离线模式提示条。
 * 当 isOffline 为 true 时显示在列表顶部，告知用户当前展示的是缓存内容，
 * 并显示最后同步时间。使用主题 accent 色作为背景。
 */
function OfflineBanner({ isOffline, lastSyncTime, theme }: OfflineBannerProps) {
  if (!isOffline) return null;

  const c = theme.colors;

  const syncText = lastSyncTime
    ? `最后同步于 ${formatRelativeTime(lastSyncTime)}`
    : '尚未同步';

  return (
    <View style={[styles.container, { backgroundColor: c.accent }]}>
      <Ionicons name="cloud-offline-outline" size={16} color="#fff" style={styles.icon} />
      <Text style={styles.text}>
        离线模式 · {syncText}
      </Text>
    </View>
  );
}

export default React.memo(OfflineBanner);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  icon: {
    marginRight: 6,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
});
