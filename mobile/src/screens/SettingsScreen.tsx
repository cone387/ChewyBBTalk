import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { getCurrentUser, logout } from '../services/auth';

interface Props {
  onLogout: () => void;
}

export default function SettingsScreen({ onLogout }: Props) {
  const currentUser = getCurrentUser();

  const handleLogout = () => {
    Alert.alert('确认退出', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: async () => {
          await logout();
          onLogout();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* 用户信息 */}
      {currentUser && (
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.displayName}>
              {currentUser.display_name || currentUser.username}
            </Text>
            <Text style={styles.username}>@{currentUser.username}</Text>
          </View>
        </View>
      )}

      {/* 设置项 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>关于</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>版本</Text>
          <Text style={styles.rowValue}>1.0.0</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>应用</Text>
          <Text style={styles.rowValue}>ChewyBBTalk</Text>
        </View>
      </View>

      {/* 退出登录 */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>退出登录</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', padding: 16 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  userInfo: { flex: 1 },
  displayName: { fontSize: 18, fontWeight: '600', color: '#111827' },
  username: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  rowLabel: { fontSize: 15, color: '#374151' },
  rowValue: { fontSize: 15, color: '#9CA3AF' },
  logoutBtn: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutText: { color: '#EF4444', fontSize: 16, fontWeight: '600' },
});
