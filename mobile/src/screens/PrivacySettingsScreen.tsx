import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { notifyPrivacyPreferencesChanged } from '../services/privacyPreferences';

export default function PrivacySettingsScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const [enabled, setEnabled] = useState(true);
  const [timeout, setTimeout_] = useState(5);
  const [showCountdown, setShowCountdown] = useState(true);
  const [allowCompose, setAllowCompose] = useState(true);
  const [lockOnLaunch, setLockOnLaunch] = useState(true);
  const [lockOnDeviceLock, setLockOnDeviceLock] = useState(true);
  const [hideAppPreview, setHideAppPreview] = useState(true);
  const [blockCapture, setBlockCapture] = useState(false);

  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const savedTimeout = useRef(5);
  const loadVersion = useRef(0);
  const load = async () => {
    const version = ++loadVersion.current;
    setLoading(true); setReady(false); setError('');
    try {
      const values = Object.fromEntries(await AsyncStorage.multiGet([
        'privacy_enabled', 'privacy_timeout_minutes', 'show_privacy_countdown', 'privacy_allow_compose',
        'privacy_lock_on_launch', 'privacy_lock_on_device_lock', 'privacy_hide_app_preview', 'privacy_block_capture',
      ]));
      if (version !== loadVersion.current) return;
      setEnabled(values.privacy_enabled !== 'false');
      const minutes = Number(values.privacy_timeout_minutes || 5);
      savedTimeout.current = Number.isFinite(minutes) ? Math.min(60, Math.max(1, minutes)) : 5;
      setTimeout_(savedTimeout.current);
      setShowCountdown(values.show_privacy_countdown !== 'false');
      setAllowCompose(values.privacy_allow_compose !== 'false');
      setLockOnLaunch(values.privacy_lock_on_launch !== 'false');
      setLockOnDeviceLock(values.privacy_lock_on_device_lock !== 'false');
      setHideAppPreview(values.privacy_hide_app_preview !== 'false');
      setBlockCapture(values.privacy_block_capture === 'true');
      setReady(true);
    } catch { if (version === loadVersion.current) setError('读取设置失败，请重新加载后再修改'); }
    finally { if (version === loadVersion.current) setLoading(false); }
  };
  React.useEffect(() => { void load(); return () => { loadVersion.current++; }; }, []);

  const persist = async (key: string, value: boolean | number, commit: () => void) => {
    if (busyRef.current || loading || !ready) return;
    busyRef.current = true; setSaving(true); setError('');
    try { await AsyncStorage.setItem(key, String(value)); commit(); notifyPrivacyPreferencesChanged(); }
    catch { setTimeout_(savedTimeout.current); setError('保存失败，修改未生效，请重试'); }
    finally { busyRef.current = false; setSaving(false); }
  };
  const onEnabledChange = (val: boolean) => persist('privacy_enabled', val, () => setEnabled(val));
  const onTimeoutChange = (val: number) => persist('privacy_timeout_minutes', Math.round(val), () => {
    savedTimeout.current = Math.round(val); setTimeout_(Math.round(val));
  });
  const onCountdownChange = (val: boolean) => persist('show_privacy_countdown', val, () => setShowCountdown(val));
  const onAllowComposeChange = (val: boolean) => persist('privacy_allow_compose', val, () => setAllowCompose(val));

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.surfaceSecondary }]} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}>
      <View style={[styles.card, { backgroundColor: c.cardBg }]}>
        <View style={[styles.cardHeader, { backgroundColor: c.primaryLight }]}>
          <View style={[styles.headerIcon, { backgroundColor: c.accent }]}><Ionicons name="lock-closed" size={20} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: c.text }]}>防窥模式</Text>
            <Text style={[styles.headerSub, { color: c.textSecondary }]}>分别管理自动锁定、后台预览和截图录屏</Text>
          </View>
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.switchLabel, { color: c.text }]}>启用自动锁定</Text>
            <Text style={[styles.switchHint, { color: c.textTertiary }]}>控制自动锁定；后台预览和截图录屏可单独设置</Text>
          </View>
          <Switch disabled={!ready || loading || saving} accessibilityState={{ disabled: !ready || loading || saving }} accessibilityLabel="启用自动锁定" value={enabled} onValueChange={onEnabledChange}
            trackColor={{ false: c.border, true: c.accent }} thumbColor="#fff" />
        </View>

        <View style={[styles.divider, { backgroundColor: c.borderLight }]} />

        <View style={[styles.section, !enabled && { opacity: 0.4 }]} pointerEvents={enabled ? 'auto' : 'none'}>
          <Text style={[styles.sectionLabel, { color: c.text }]}>防窥超时时长</Text>
          <View style={styles.sliderRow}>
            <Slider disabled={!ready || !enabled || loading || saving} accessibilityLabel="防窥超时时长" style={{ flex: 1 }} minimumValue={1} maximumValue={60} step={1}
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
            <Text style={[styles.switchHint, { color: c.textTertiary }]}>在记录页显示剩余时间</Text>
          </View>
          <Switch disabled={!ready || !enabled || loading || saving} accessibilityState={{ disabled: !ready || !enabled || loading || saving }} accessibilityLabel="显示防窥倒计时" value={showCountdown} onValueChange={onCountdownChange}
            trackColor={{ false: c.border, true: c.primary }} thumbColor="#fff" />
        </View>

        <View style={[styles.divider, { backgroundColor: c.borderLight }]} />

        <View style={[styles.switchRow, !enabled && { opacity: 0.4 }]} pointerEvents={enabled ? 'auto' : 'none'}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.switchLabel, { color: c.text }]}>锁定时允许新建</Text>
            <Text style={[styles.switchHint, { color: c.textTertiary }]}>锁定后直接进入快速记录，查看历史需解锁</Text>
          </View>
          <Switch disabled={!ready || !enabled || loading || saving} accessibilityState={{ disabled: !ready || !enabled || loading || saving }} accessibilityLabel="锁定时允许新建" value={allowCompose} onValueChange={onAllowComposeChange}
            trackColor={{ false: c.border, true: c.primary }} thumbColor="#fff" />
        </View>

        {[
          { key: 'privacy_lock_on_launch', label: '启动时锁定', hint: '重新启动应用时先锁定；短暂切到后台再返回不因此锁定', value: lockOnLaunch, setter: setLockOnLaunch, dependsOnEnabled: true },
          { key: 'privacy_lock_on_device_lock', label: '设备锁屏后锁定', hint: '设备锁屏后再次打开应用需要解锁；普通切换应用不因此锁定。受系统识别能力限制', value: lockOnDeviceLock, setter: setLockOnDeviceLock, dependsOnEnabled: true },
          { key: 'privacy_hide_app_preview', label: '隐藏后台预览', hint: '离开应用时遮住多任务预览，返回后恢复；不会因此锁定应用', value: hideAppPreview, setter: setHideAppPreview, dependsOnEnabled: false },
          { key: 'privacy_block_capture', label: '阻止截图与录屏', hint: '可选，默认关闭。开启后限制截图与录屏，部分系统可能显示黑色多任务预览；效果受系统版本和设备限制', value: blockCapture, setter: setBlockCapture, dependsOnEnabled: false },
        ].map(option => {
          const disabled = !ready || loading || saving || (option.dependsOnEnabled && !enabled);
          return (
            <React.Fragment key={option.key}>
              <View style={[styles.divider, { backgroundColor: c.borderLight }]} />
              <View style={[styles.switchRow, option.dependsOnEnabled && !enabled && { opacity: 0.4 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.switchLabel, { color: c.text }]}>{option.label}</Text>
                  <Text style={[styles.switchHint, { color: c.textTertiary }]}>{option.hint}</Text>
                </View>
                <Switch disabled={disabled} accessibilityState={{ disabled }} accessibilityLabel={option.label}
                  accessibilityHint={option.hint} value={option.value}
                  onValueChange={value => { if (!disabled) void persist(option.key, value, () => option.setter(value)); }}
                  trackColor={{ false: c.border, true: c.primary }} thumbColor="#fff" />
              </View>
            </React.Fragment>
          );
        })}

        <View style={styles.savedRow}>
          <Text accessibilityRole={error ? 'alert' : undefined} style={[styles.savedText, { color: error ? c.danger : c.textSecondary, flex: 1 }]}>
            {loading ? '正在读取设置…' : saving ? '正在保存…' : error || '修改后自动保存'}
          </Text>
          {!!error && <TouchableOpacity accessibilityRole="button" disabled={loading || saving} onPress={load} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.primary }}>重新加载</Text></TouchableOpacity>}
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
