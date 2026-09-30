import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { buildImageSource } from '../utils/imageSource';
import { getCurrentUser, logout } from '../services/auth';
import { useTheme } from '../theme/ThemeContext';
import { getApiBaseUrl } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { xConfirm, xAlert } from '../utils/crossAlert';

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
      { key: 'account', title: '账号与安全', subtitle: '账号信息、密码与账号恢复', icon: 'person-circle', bgColor: '#EF4444' },
    ],
  },
  {
    title: '个性化',
    items: [
      { key: 'tags', title: '标签管理', subtitle: '整理标签、调整顺序与颜色', icon: 'pricetags-outline', bgColor: '#6366F1' },
      { key: 'theme', title: '外观', subtitle: '跟随系统、浅色与深色', icon: 'color-palette', bgColor: '#8B5CF6' },
      { key: 'tagTabs', title: '记录页标签栏', subtitle: '在记录页顶部显示标签快捷切换', icon: 'pricetags', bgColor: '#6366F1', type: 'switch' },
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
      { key: 'data', title: '备份与导出', subtitle: '导出记录，保留自己的副本', icon: 'swap-horizontal', bgColor: '#EA580C' },
      { key: 'advanced', title: '高级设置', subtitle: '自定义存储与缓存管理', icon: 'options-outline', bgColor: '#64748B' },
    ],
  },
  {
    title: '其他',
    items: [
      { key: 'about', title: '帮助与关于', subtitle: '联系支持、隐私政策、版本信息', icon: 'information-circle', bgColor: '#6366F1' },
    ],
  },
];

const ROUTES: Record<string, string> = {
  account: 'AccountSecurity',
  advanced: 'AdvancedSettings',
  theme: 'ThemeSettings',
  tags: 'TagManagement',
  privacy: 'PrivacySettings',
  storage: 'StorageSettings',
  data: 'DataManagement',
  cache: 'CacheManagement',
  about: 'About',
};

export default function SettingsScreen({ onLogout }: Props) {
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const c = theme.colors;
  const [showTagTabs, setShowTagTabs] = useState(true);
  const [savingTags, setSavingTags] = useState(true);
  const savingTagsRef = useRef(false);
  const saveTagTabs = async (value: boolean) => {
    if (savingTagsRef.current) return;
    savingTagsRef.current = true; setSavingTags(true);
    try { await AsyncStorage.setItem('show_tag_tabs', String(value)); setShowTagTabs(value); }
    catch { xAlert('保存失败', '标签栏设置未生效，请重试'); }
    finally { savingTagsRef.current = false; setSavingTags(false); }
  };

  // 页面获得焦点时刷新用户信息（从 ProfileEdit 返回后头像等即时更新）
  useFocusEffect(useCallback(() => {
    setCurrentUser(getCurrentUser());
  }, []));

  useEffect(() => {
    AsyncStorage.getItem('show_tag_tabs').then(v => setShowTagTabs(v !== 'false')).catch(() => xAlert('读取设置失败', '请稍后重试')).finally(() => setSavingTags(false));
  }, []);

  const handleLogout = () => {
    xConfirm('确认退出', '确定要退出登录吗？', async () => {
      await logout(); onLogout();
    }, undefined, { confirmText: '退出', destructive: true });
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
            onValueChange={saveTagTabs}
            disabled={savingTags}
            trackColor={{ false: c.border, true: c.primary }}
            thumbColor="#fff"
            accessibilityLabel="显示记录页标签栏"
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
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}>
        {/* 用户信息卡 */}
        {currentUser && (
          <TouchableOpacity
            accessibilityRole="button" accessibilityLabel="编辑个人信息"
            style={[styles.userCard, { backgroundColor: c.cardBg }]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('ProfileEdit')}
          >
            <View style={styles.userRow}>
              {currentUser.avatar ? (
                <Image source={buildImageSource(currentUser.avatar)} style={styles.avatar} contentFit="cover" />
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
      <View style={styles.logoutBar}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="退出登录" style={[styles.logoutBtn, { backgroundColor: c.cardBg }]} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color={c.danger} />
          <Text style={[styles.logoutText, { color: c.danger }]}>退出登录</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
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
  logoutBar: { marginTop: 24 },
  logoutBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    borderRadius: 14, paddingVertical: 14,
  },
  logoutText: { fontSize: 15, fontWeight: '600' },
});
