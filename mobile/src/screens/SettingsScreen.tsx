import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCurrentUser, logout } from '../services/auth';

interface Props {
  onLogout: () => void;
}

const MENU_ITEMS = [
  { key: 'privacy', title: '防窥设置', subtitle: '超时时长、倒计时显示', icon: 'lock-closed' as const, bgColor: '#7C3AED' },
  { key: 'storage', title: '存储设置', subtitle: '服务器存储、S3 云存储配置', icon: 'server' as const, bgColor: '#059669' },
  { key: 'data', title: '数据管理', subtitle: '导入导出数据，跨服务器迁移', icon: 'swap-horizontal' as const, bgColor: '#EA580C' },
];

export default function SettingsScreen({ onLogout }: Props) {
  const currentUser = getCurrentUser();
  const insets = useSafeAreaInsets();

  const handleLogout = () => {
    Alert.alert('确认退出', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: async () => { await logout(); onLogout(); } },
    ]);
  };

  const handleMenuPress = (_key: string) => {
    Alert.alert('提示', '该功能正在开发中，敬请期待');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}>
      {/* 设置菜单 */}
      {MENU_ITEMS.map(item => (
        <TouchableOpacity key={item.key} style={styles.menuCard} activeOpacity={0.7} onPress={() => handleMenuPress(item.key)}>
          <View style={styles.menuRow}>
            <View style={[styles.menuIcon, { backgroundColor: item.bgColor }]}>
              <Ionicons name={item.icon} size={22} color="#fff" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </View>
        </TouchableOpacity>
      ))}

      {/* 用户信息 + 退出 */}
      {currentUser && (
        <View style={styles.userCard}>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{currentUser.display_name || currentUser.username}</Text>
              <Text style={styles.userEmail}>{currentUser.email || `@${currentUser.username}`}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            <Text style={styles.logoutText}>退出登录</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 版本信息 - 最底部 */}
      <Text style={styles.version}>ChewyBBTalk v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4FF' },
  scrollContent: { padding: 16, paddingTop: 12 },
  menuCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
    elevation: 3, borderWidth: 1, borderColor: '#F3F4F6',
  },
  menuRow: { flexDirection: 'row', alignItems: 'center' },
  menuIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  menuInfo: { flex: 1 },
  menuTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  menuSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 3 },
  userCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginTop: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
    elevation: 3, borderWidth: 1, borderColor: '#F3F4F6',
  },
  userRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#7C3AED',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: '600', color: '#111827' },
  userEmail: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  logoutBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 12, paddingVertical: 12,
  },
  logoutText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
  version: { textAlign: 'center', color: '#C4C4C4', fontSize: 12, marginTop: 24 },
});
