import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getCurrentUser, logout } from '../services/auth';
import { useTheme } from '../theme/ThemeContext';
import { getApiBaseUrl } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Props { onLogout: () => void; }

const MENU_ITEMS = [
  { key: 'theme', title: '主题设置', subtitle: '切换多种主题风格', icon: 'color-palette' as const, bgColor: '#8B5CF6' },
  { key: 'privacy', title: '防窥设置', subtitle: '超时时长、倒计时显示', icon: 'lock-closed' as const, bgColor: '#7C3AED' },
  { key: 'storage', title: '存储设置', subtitle: '服务器存储、S3 云存储配置', icon: 'server' as const, bgColor: '#059669' },
  { key: 'data', title: '数据管理', subtitle: '导入导出数据，跨服务器迁移', icon: 'swap-horizontal' as const, bgColor: '#EA580C' },
  { key: 'cache', title: '缓存管理', subtitle: '查看和清理已下载的媒体文件', icon: 'folder-open' as const, bgColor: '#0EA5E9' },
  { key: 'privacy-policy', title: '隐私政策', subtitle: '查看数据收集与使用说明', icon: 'shield-checkmark' as const, bgColor: '#0EA5E9' },
  { key: 'about', title: '关于', subtitle: '版本信息、检查更新', icon: 'information-circle' as const, bgColor: '#6366F1' },
];

export default function SettingsScreen({ onLogout }: Props) {
  const currentUser = getCurrentUser();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const c = theme.colors;
  const [showTagTabs, setShowTagTabs] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('show_tag_tabs').then(v => setShowTagTabs(v === 'true'));
  }, []);

  const handleLogout = () => {
    Alert.alert('确认退出', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: async () => { await logout(); onLogout(); } },
    ]);
  };

  const handleMenuPress = (key: string) => {
    if (key === 'privacy-policy') {
      Linking.openURL(`${getApiBaseUrl()}/privacy-policy/`);
      return;
    }
    const routes: Record<string, string> = {
      theme: 'ThemeSettings',
      privacy: 'PrivacySettings',
      storage: 'StorageSettings',
      data: 'DataManagement',
      cache: 'CacheManagement',
      about: 'About',
    };
    navigation.navigate(routes[key]);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}>
        {/* 用户信息卡 - 点击进入编辑页 */}
        {currentUser && (
          <TouchableOpacity
            style={[styles.userCard, { backgroundColor: c.cardBg }]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('ProfileEdit')}
          >
            <View style={styles.userRow}>
              <View style={[styles.avatar, { backgroundColor: c.avatarBg }]}>
                <Text style={styles.avatarText}>
                  {(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: c.text }]}>
                  {currentUser.display_name || currentUser.username}
                </Text>
                <Text style={[styles.userEmail, { color: c.textSecondary }]}>
                  {currentUser.email || `@${currentUser.username}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
            </View>
          </TouchableOpacity>
        )}

        {/* 设置菜单 */}
        {MENU_ITEMS.map(item => (
          <TouchableOpacity
            key={item.key}
            style={[styles.menuCard, { backgroundColor: c.cardBg }]}
            activeOpacity={0.7}
            onPress={() => handleMenuPress(item.key)}
          >
            <View style={styles.menuRow}>
              <View style={[styles.menuIcon, { backgroundColor: item.bgColor }]}>
                <Ionicons name={item.icon} size={22} color="#fff" />
              </View>
              <View style={styles.menuInfo}>
                <Text style={[styles.menuTitle, { color: c.text }]}>{item.title}</Text>
                <Text style={[styles.menuSubtitle, { color: c.textSecondary }]}>{item.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={c.textTertiary} />
            </View>
          </TouchableOpacity>
        ))}

        {/* 显示设置 */}
        <View style={[styles.menuCard, { backgroundColor: c.cardBg }]}>
          <View style={styles.menuRow}>
            <View style={[styles.menuIcon, { backgroundColor: '#6366F1' }]}>
              <Ionicons name="pricetags" size={22} color="#fff" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={[styles.menuTitle, { color: c.text }]}>首页标签栏</Text>
              <Text style={[styles.menuSubtitle, { color: c.textSecondary }]}>在首页顶部显示标签快捷切换</Text>
            </View>
            <Switch value={showTagTabs} onValueChange={(v) => {
              setShowTagTabs(v);
              AsyncStorage.setItem('show_tag_tabs', v ? 'true' : 'false');
            }} trackColor={{ false: c.border, true: c.primary }} thumbColor="#fff" />
          </View>
        </View>

        <Text style={[styles.version, { color: c.textTertiary }]}>ChewyBBTalk v1.1.0</Text>
      </ScrollView>

      <View style={[styles.logoutBar, { paddingBottom: insets.bottom + 12, backgroundColor: c.surfaceSecondary }]}>
        <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: c.dangerBg }]} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color={c.danger} />
          <Text style={[styles.logoutText, { color: c.danger }]}>退出登录</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 12 },
  userCard: {
    borderRadius: 16, padding: 18, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 17, fontWeight: '600' },
  userEmail: { fontSize: 13, marginTop: 2 },
  menuCard: {
    borderRadius: 16, padding: 18, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center' },
  menuIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  menuInfo: { flex: 1 },
  menuTitle: { fontSize: 16, fontWeight: '600' },
  menuSubtitle: { fontSize: 13, marginTop: 3 },
  version: { textAlign: 'center', fontSize: 12, marginTop: 20 },
  logoutBar: { paddingHorizontal: 16, paddingTop: 8 },
  logoutBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    borderRadius: 14, paddingVertical: 14,
  },
  logoutText: { fontSize: 15, fontWeight: '600' },
});
