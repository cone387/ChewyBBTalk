import React from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { getApiBaseUrl } from '../config';

export default function AdvancedSettingsScreen() {
  const { theme: { colors: c } } = useTheme();
  const navigation = useNavigation<any>();
  return <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 20 }}>
    <Text style={{ color: c.textSecondary, lineHeight: 22, marginBottom: 20 }}>这些选项适用于自建服务或自定义存储。日常记录无需调整。</Text>
    {[{ title: '附件存储', hint: '服务器存储与自定义 S3', route: 'StorageSettings', icon: 'server-outline' }, { title: '缓存管理', hint: '清理已下载的媒体缓存', route: 'CacheManagement', icon: 'folder-outline' }].map(item => <TouchableOpacity key={item.route} accessibilityRole="button" onPress={() => navigation.navigate(item.route)} style={{ flexDirection: 'row', gap: 14, padding: 18, marginBottom: 12, backgroundColor: c.surface, borderRadius: 14, alignItems: 'center' }}>
      <Ionicons name={item.icon as any} size={24} color={c.primary} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 16 }}>{item.title}</Text><Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 6 }}>{item.hint}</Text></View><Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
    </TouchableOpacity>)}
    <Text style={{ color: c.textSecondary, marginTop: 20, lineHeight: 22 }}>当前服务</Text><Text selectable style={{ color: c.text, marginTop: 8 }}>{getApiBaseUrl()}</Text>
    <Text style={{ color: c.textSecondary, lineHeight: 22, marginTop: 12 }}>如需切换服务，请退出登录后选择“使用自建服务”。不同服务的账号与记录相互独立。</Text>
  </ScrollView>;
}
