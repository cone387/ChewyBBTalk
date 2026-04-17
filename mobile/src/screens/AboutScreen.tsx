import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { checkForUpdates } from '../utils/versionChecker';
import Constants from 'expo-constants';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const version = Constants.expoConfig?.version || '1.1.0';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber || '1';
  const [checking, setChecking] = useState(false);

  const handleCheckUpdate = async () => {
    if (checking) return;
    setChecking(true);
    try {
      await checkForUpdates();
      // If checkForUpdates didn't show its own alert (no update found), show "up to date"
      Alert.alert('检查完成', '当前已是最新版本');
    } catch {
      Alert.alert('检查完成', '当前已是最新版本');
    } finally {
      setChecking(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.surfaceSecondary }]}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}>
      
      <View style={[styles.logoCard, { backgroundColor: c.cardBg }]}>
        <View style={[styles.logoIcon, { backgroundColor: c.accent }]}>
          <Ionicons name="chatbubbles" size={36} color="#fff" />
        </View>
        <Text style={[styles.appName, { color: c.text }]}>ChewyBBTalk</Text>
        <Text style={[styles.versionText, { color: c.textSecondary }]}>版本 {version} (Build {buildNumber})</Text>
        <Text style={[styles.descText, { color: c.textTertiary }]}>记录生活的点滴碎碎念</Text>
      </View>

      <TouchableOpacity style={[styles.actionCard, { backgroundColor: c.cardBg }]} activeOpacity={0.7}
        onPress={handleCheckUpdate} disabled={checking}>
        <View style={styles.actionRow}>
          <View style={[styles.actionIcon, { backgroundColor: '#10B981' }]}>
            {checking ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="refresh-outline" size={20} color="#fff" />}
          </View>
          <View style={styles.actionInfo}>
            <Text style={[styles.actionTitle, { color: c.text }]}>{checking ? '正在检查...' : '检查更新'}</Text>
            <Text style={[styles.actionSub, { color: c.textSecondary }]}>检查是否有新版本可用</Text>
          </View>
          {!checking && <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />}
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.actionCard, { backgroundColor: c.cardBg }]} activeOpacity={0.7}
        onPress={() => Linking.openURL('https://github.com/cone387/ChewyBBTalk')}>
        <View style={styles.actionRow}>
          <View style={[styles.actionIcon, { backgroundColor: '#1F2937' }]}>
            <Ionicons name="logo-github" size={20} color="#fff" />
          </View>
          <View style={styles.actionInfo}>
            <Text style={[styles.actionTitle, { color: c.text }]}>GitHub 仓库</Text>
            <Text style={[styles.actionSub, { color: c.textSecondary }]}>查看源代码和提交反馈</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
        </View>
      </TouchableOpacity>

      <View style={[styles.techCard, { backgroundColor: c.cardBg }]}>
        <Text style={[styles.techTitle, { color: c.text }]}>技术栈</Text>
        {[
          { label: 'Expo SDK', value: '54' },
          { label: 'React Native', value: '0.81' },
          { label: 'TypeScript', value: '5.9' },
          { label: 'Redux Toolkit', value: '2.x' },
        ].map(item => (
          <View key={item.label} style={[styles.techRow, { borderBottomColor: c.borderLight }]}>
            <Text style={[styles.techLabel, { color: c.textSecondary }]}>{item.label}</Text>
            <Text style={[styles.techValue, { color: c.text }]}>{item.value}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.copyright, { color: c.textTertiary }]}>
        © 2024-2026 ChewyBBTalk{'\n'}Made with ❤️
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  logoCard: {
    borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  logoIcon: { width: 72, height: 72, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  appName: { fontSize: 22, fontWeight: '700' },
  versionText: { fontSize: 14, marginTop: 4 },
  descText: { fontSize: 13, marginTop: 6 },
  actionCard: {
    borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  actionIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  actionInfo: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '600' },
  actionSub: { fontSize: 12, marginTop: 2 },
  techCard: {
    borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  techTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  techRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5 },
  techLabel: { fontSize: 14 },
  techValue: { fontSize: 14, fontWeight: '500' },
  copyright: { textAlign: 'center', fontSize: 12, marginTop: 20, lineHeight: 20 },
});
