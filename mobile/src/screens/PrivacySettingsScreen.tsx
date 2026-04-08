import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView } from 'react-native';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PrivacySettingsScreen() {
  const insets = useSafeAreaInsets();
  const [timeout, setTimeout_] = useState(5);
  const [showCountdown, setShowCountdown] = useState(true);

  React.useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('privacy_timeout_minutes');
      if (t) setTimeout_(parseInt(t, 10));
      const c = await AsyncStorage.getItem('show_privacy_countdown');
      if (c) setShowCountdown(c === 'true');
    })();
  }, []);

  const onTimeoutChange = async (val: number) => {
    const v = Math.round(val);
    setTimeout_(v);
    await AsyncStorage.setItem('privacy_timeout_minutes', v.toString());
  };

  const onCountdownChange = async (val: boolean) => {
    setShowCountdown(val);
    await AsyncStorage.setItem('show_privacy_countdown', val.toString());
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerIcon}><Ionicons name="lock-closed" size={20} color="#fff" /></View>
          <View>
            <Text style={styles.headerTitle}>防窥模式</Text>
            <Text style={styles.headerSub}>长时间不操作后自动模糊内容，保护隐私</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>防窥超时时长</Text>
          <View style={styles.sliderRow}>
            <Slider style={{ flex: 1 }} minimumValue={1} maximumValue={60} step={1}
              value={timeout} onSlidingComplete={onTimeoutChange}
              minimumTrackTintColor="#2563EB" maximumTrackTintColor="#E5E7EB" thumbTintColor="#2563EB" />
            <Text style={styles.sliderValue}>{timeout} 分钟</Text>
          </View>
          <Text style={styles.hint}>长时间不活动后，内容将自动模糊以保护隐私</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>显示防窥倒计时</Text>
            <Text style={styles.switchHint}>在页面底部显示倒计时提示</Text>
          </View>
          <Switch value={showCountdown} onValueChange={onCountdownChange}
            trackColor={{ false: '#E5E7EB', true: '#2563EB' }} thumbColor="#fff" />
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
  container: { flex: 1, backgroundColor: '#F0F4FF' },
  card: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16,
    backgroundColor: '#F5F3FF',
  },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  section: { padding: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 12 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sliderValue: { fontSize: 14, fontWeight: '600', color: '#111827', width: 60, textAlign: 'right' },
  hint: { fontSize: 12, color: '#9CA3AF', marginTop: 8 },
  divider: { height: 0.5, backgroundColor: '#F3F4F6', marginHorizontal: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  switchLabel: { fontSize: 14, fontWeight: '500', color: '#374151' },
  switchHint: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 16 },
  savedText: { fontSize: 12, color: '#10B981' },
});
