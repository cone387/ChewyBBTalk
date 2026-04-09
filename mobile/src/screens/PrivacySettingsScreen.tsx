import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView } from 'react-native';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

export default function PrivacySettingsScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const [enabled, setEnabled] = useState(true);
  const [timeout, setTimeout_] = useState(5);
  const [showCountdown, setShowCountdown] = useState(true);
  const [allowCompose, setAllowCompose] = useState(true);

  React.useEffect(() => {
    (async () => {
      const e = await AsyncStorage.getItem('privacy_enabled');
      if (e === 'false') setEnabled(false);
      const t = await AsyncStorage.getItem('privacy_timeout_minutes');
      if (t) setTimeout_(parseInt(t, 10));
      const c = await AsyncStorage.getItem('show_privacy_countdown');
      if (c === 'false') setShowCountdown(false);
      const a = await AsyncStorage.getItem('privacy_allow_compose');
      if (a === 'false') setAllowCompose(false);
    })();
  }, []);

  const onEnabledChange = async (val: boolean) => {
    setEnabled(val);
    await AsyncStorage.setItem('privacy_enabled', val.toString());
  };

  const onTimeoutChange = async (val: number) => {
    const v = Math.round(val);
    setTimeout_(v);
    await AsyncStorage.setItem('privacy_timeout_minutes', v.toString());
  };

  const onCountdownChange = async (val: boolean) => {
    setShowCountdown(val);
    await AsyncStorage.setItem('show_privacy_countdown', val.toString());
  };

  const onAllowComposeChange = async (val: boolean) => {
    setAllowCompose(val);
    await AsyncStorage.setItem('privacy_allow_compose', val.toString());
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.surfaceSecondary }]} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}>
      <View style={[styles.card, { backgroundColor: c.cardBg }]}>
        <View style={[styles.cardHeader, { backgroundColor: c.primaryLight }]}>
          <View style={[styles.headerIcon, { backgroundColor: c.accent }]}><Ionicons name="lock-closed" size={20} color="#fff" /></View>
          <View>
            <Text style={[styles.headerTitle, { color: c.text }]}>防窥模式</Text>
            <Text style={[styles.headerSub, { color: c.textSecondary }]}>长时间不操作后自动锁定，保护隐私</Text>
          </View>
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.switchLabel, { color: c.text }]}>启用防窥模式</Text>
            <Text style={[styles.switchHint, { color: c.textTertiary }]}>关闭后不会自动锁定</Text>
          </View>
          <Switch value={enabled} onValueChange={onEnabledChange}
            trackColor={{ false: c.border, true: c.accent }} thumbColor="#fff" />
        </View>

        <View style={[styles.divider, { backgroundColor: c.borderLight }]} />

        <View style={[styles.section, !enabled && { opacity: 0.4 }]} pointerEvents={enabled ? 'auto' : 'none'}>
          <Text style={[styles.sectionLabel, { color: c.text }]}>防窥超时时长</Text>
          <View style={styles.sliderRow}>
            <Slider style={{ flex: 1 }} minimumValue={1} maximumValue={60} step={1}
              value={timeout}
              onValueChange={(val: number) => setTimeout_(Math.round(val))}
              onSlidingComplete={onTimeoutChange}
              minimumTrackTintColor={c.primary} maximumTrackTintColor={c.border} thumbTintColor={c.primary} />
            <Text style={[styles.sliderValue, { color: c.text }]}>{timeout} 分钟</Text>
          </View>
          <Text style={[styles.hint, { color: c.textTertiary }]}>无操作超过此时长后自动锁定</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: c.borderLight }]} />

        <View style={[styles.switchRow, !enabled && { opacity: 0.4 }]} pointerEvents={enabled ? 'auto' : 'none'}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.switchLabel, { color: c.text }]}>显示防窥倒计时</Text>
            <Text style={[styles.switchHint, { color: c.textTertiary }]}>在首页右下角显示剩余时间</Text>
          </View>
          <Switch value={showCountdown} onValueChange={onCountdownChange}
            trackColor={{ false: c.border, true: c.primary }} thumbColor="#fff" />
        </View>

        <View style={[styles.divider, { backgroundColor: c.borderLight }]} />

        <View style={[styles.switchRow, !enabled && { opacity: 0.4 }]} pointerEvents={enabled ? 'auto' : 'none'}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.switchLabel, { color: c.text }]}>锁定时允许新建</Text>
            <Text style={[styles.switchHint, { color: c.textTertiary }]}>防窥模式下仍可发布碎碎念</Text>
          </View>
          <Switch value={allowCompose} onValueChange={onAllowComposeChange}
            trackColor={{ false: c.border, true: c.primary }} thumbColor="#fff" />
        </View>

        <View style={styles.savedRow}>
          <Ionicons name="checkmark-circle" size={14} color="#10B981" />
          <Text style={styles.savedText}>设置自动保存，立即生效</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { borderRadius: 16, overflow: 'hidden' },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16,
  },
  headerIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  headerSub: { fontSize: 12, marginTop: 2 },
  section: { padding: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '500', marginBottom: 12 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sliderValue: { fontSize: 14, fontWeight: '600', width: 60, textAlign: 'right' },
  hint: { fontSize: 12, marginTop: 8 },
  divider: { height: 0.5, marginHorizontal: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  switchLabel: { fontSize: 14, fontWeight: '500' },
  switchHint: { fontSize: 12, marginTop: 2 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 16 },
  savedText: { fontSize: 12, color: '#10B981' },
});
