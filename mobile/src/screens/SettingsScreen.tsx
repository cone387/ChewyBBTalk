import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getCurrentUser, logout } from '../services/auth';

interface Props { onLogout: () => void; }

const MENU_ITEMS = [
  { key: 'privacy', title: '防窥设置', subtitle: '超时时长、倒计时显示', icon: 'lock-closed' as const, bgColor: '#7C3AED' },
  { key: 'storage', title: '存储设置', subtitle: '服务器存储、S3 云存储配置', icon: 'server' as const, bgColor: '#059669' },
  { key: 'data', title: '数据管理', subtitle: '导入导出数据，跨服务器迁移', icon: 'swap-horizontal' as const, bgColor: '#EA580C' },
];

export default function SettingsScreen({ onLogout }: Props) {
  const currentUser = getCurrentUser();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [showProfile, setShowProfile] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser?.display_name || '');
  const [bio, setBio] = useState(currentUser?.bio || '');

  const handleLogout = () => {
    Alert.alert('确认退出', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: async () => { await logout(); onLogout(); } },
    ]);
  };

  const handleMenuPress = (key: string) => {
    navigation.navigate(key === 'privacy' ? 'PrivacySettings' : key === 'storage' ? 'StorageSettings' : 'DataManagement');
  };

  const handleSaveProfile = () => {
    // TODO: call API to update user profile
    Alert.alert('提示', '个人信息更新功能开发中');
    setShowProfile(false);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}>
        {/* 用户信息卡 */}
        {currentUser && (
          <TouchableOpacity style={styles.userCard} activeOpacity={0.7} onPress={() => setShowProfile(!showProfile)}>
            <View style={styles.userRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{currentUser.display_name || currentUser.username}</Text>
                <Text style={styles.userEmail}>{currentUser.email || `@${currentUser.username}`}</Text>
              </View>
              <Ionicons name={showProfile ? 'chevron-up' : 'chevron-forward'} size={18} color="#D1D5DB" />
            </View>
          </TouchableOpacity>
        )}

        {/* 个人信息编辑 */}
        {showProfile && (
          <View style={styles.profileCard}>
            <Text style={styles.profileLabel}>显示名称</Text>
            <TextInput style={styles.profileInput} value={displayName} onChangeText={setDisplayName} placeholder="输入显示名称" />
            <Text style={styles.profileLabel}>个人简介</Text>
            <TextInput style={[styles.profileInput, { minHeight: 60 }]} value={bio} onChangeText={setBio}
              placeholder="输入个人简介" multiline textAlignVertical="top" />
            <TouchableOpacity style={styles.profileSaveBtn} onPress={handleSaveProfile}>
              <Text style={styles.profileSaveText}>保存</Text>
            </TouchableOpacity>
          </View>
        )}

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

        {/* 版本 */}
        <Text style={styles.version}>ChewyBBTalk v1.0.0</Text>
      </ScrollView>

      {/* 退出登录 - 固定底部 */}
      <View style={[styles.logoutBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={styles.logoutText}>退出登录</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4FF' },
  scrollContent: { padding: 16, paddingTop: 12 },
  userCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 17, fontWeight: '600', color: '#111827' },
  userEmail: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  profileCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  profileLabel: { fontSize: 13, fontWeight: '500', color: '#6B7280', marginBottom: 6, marginTop: 8 },
  profileInput: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: '#111827',
  },
  profileSaveBtn: { marginTop: 12, backgroundColor: '#2563EB', borderRadius: 10, height: 40, justifyContent: 'center', alignItems: 'center' },
  profileSaveText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  menuCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center' },
  menuIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  menuInfo: { flex: 1 },
  menuTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  menuSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 3 },
  version: { textAlign: 'center', color: '#C4C4C4', fontSize: 12, marginTop: 20 },
  logoutBar: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: '#F0F4FF' },
  logoutBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 14,
  },
  logoutText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
});
