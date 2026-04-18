import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getCurrentUser, logout } from '../services/auth';
import { useTheme } from '../theme/ThemeContext';
import { getApiBaseUrl } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Props { onLogout: () => void; }

type MenuItem =
  | { key: string; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; bgColor: string; type?: 'nav' }
  | { key: string; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; bgColor: string; type: 'switch' };

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const SECTIONS: MenuSection[] = [
  {
    title: '账号',
    items: [
      { key: 'account', title: '账号与安全', subtitle: '账号信息、删除账号', icon: 'person-circle', bgColor: '#EF4444' },
    ],
  },
  {
    title: '个性化',
    items: [
      { key: 'theme', title: '主题设置', subtitle: '切换多种主题风格', icon: 'color-palette', bgColor: '#8B5CF6' },
      { key: 'tagTabs', title: '首页标签栏', subtitle: '在首页顶部显示标签快捷切换', icon: 'pricetags', bgColor: '#6366F1', type: 'switch' },
    ],
  },
  {
    title: '隐私与安全',
    items: [
      { key: 'privacy', title: '防窥设置', subtitle: '超时时长、倒计时显示', icon: 'lock-closed', bgColor: '#7C3AED' },
    ],
  },
  {
    title: '数据与存储',
    items: [
      { key: 'storage', title: '存储设置', subtitle: '服务器存储、S3 云存储配置', icon: 'server', bgColor: '#059669' },
      { key: 'data', title: '数据管理', subtitle: '导入导出数据，跨服务器迁移', icon: 'swap-horizontal', bgColor: '#EA580C' },
      { key: 'cache', title: '缓存管理', subtitle: '查看和清理已下载的媒体文件', icon: 'folder-open', bgColor: '#0EA5E9' },
    ],
  },
  {
    title: '其他',
    items: [
      { key: 'about', title: '关于', subtitle: '版本信息、检查更新', icon: 'information-circle', bgColor: '#6366F1' },
    ],
  },
];

const ROUTES: Record<string, string> = {
  account: 'AccountSecurity',
  theme: 'ThemeSettings',
  privacy: 'PrivacySettings',
  storage: 'StorageSettings',
  data: 'DataManagement',
  cache: 'CacheManagement',
  about: 'About',
};

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
    if (Platform.OS === 'web') {
      if (window.confirm('确定要退出登录吗？')) {
        logout().then(() => onLogout());
      }
      return;
    }
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
    const route = ROUTES[key];
    if (route) navigation.navigate(route);
  };

  const renderItem = (item: MenuItem, isLast: boolean) => {
    const isSwitch = item.type === 'switch';

    const content = (
      <View style={[styles.menuRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
        <View style={[styles.menuIcon, { backgroundColor: item.bgColor }]}>
          <Ionicons name={item.icon as any} size={20} color="#fff" />
        </View>
        <View style={styles.menuInfo}>
          <Text style={[styles.menuTitle, { color: c.text }]}>{item.title}</Text>
          <Text style={[styles.menuSubtitle, { color: c.textSecondary }]}>{item.subtitle}</Text>
        </View>
        {isSwitch ? (
          <Switch
            value={showTagTabs}
            onValueChange={(v) => { setShowTagTabs(v); AsyncStorage.setItem('show_tag_tabs', v ? 'true' : 'false'); }}
            trackColor={{ false: c.border, true: c.primary }}
            thumbColor="#fff"
          />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
        )}
      </View>
    );

    if (isSwitch) {
      return <View key={item.key}>{content}</View>;
    }

    return (
      <TouchableOpacity key={item.key} activeOpacity={0.6} onPress={() => handleMenuPress(item.key)}>
        {content}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}>
        {/* 用户信息卡 */}
        {currentUser && (
          <TouchableOpacity
            style={[styles.userCard, { backgroundColor: c.cardBg }]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('ProfileEdit')}
          >
            <View style={styles.userRow}>
              {currentUser.avatar ? (
                <Image source={currentUser.avatar} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, { backgroundColor: c.avatarBg }]}>
                  <Text style={styles.avatarText}>
                    {(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
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

        {/* 分组菜单 */}
        {SECTIONS.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>{section.title}</Text>
            <View style={[styles.sectionCard, { backgroundColor: c.cardBg }]}>
              {section.items.map((item, idx) => renderItem(item, idx === section.items.length - 1))}
            </View>
          </View>
        ))}
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
    borderRadius: 16, padding: 18, marginBottom: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 14, overflow: 'hidden' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 17, fontWeight: '600' },
  userEmail: { fontSize: 13, marginTop: 2 },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 13, fontWeight: '500', marginBottom: 6, marginLeft: 4 },
  sectionCard: {
    borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  menuIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  menuInfo: { flex: 1 },
  menuTitle: { fontSize: 15, fontWeight: '600' },
  menuSubtitle: { fontSize: 12, marginTop: 2 },
  logoutBar: { paddingHorizontal: 16, paddingTop: 8 },
  logoutBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    borderRadius: 14, paddingVertical: 14,
  },
  logoutText: { fontSize: 15, fontWeight: '600' },
});
