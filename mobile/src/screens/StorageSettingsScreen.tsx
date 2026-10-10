import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../services/api/apiClient';
import type { StorageSettings } from '../types';
import { useTheme } from '../theme/ThemeContext';
import LoadingPlaceholder from '../components/LoadingPlaceholder';
import { xAlert, xConfirm } from '../utils/crossAlert';

export default function StorageSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const [configs, setConfigs] = useState<StorageSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [form, setForm] = useState({ name: '', s3_access_key_id: '', s3_secret_access_key: '', s3_bucket_name: '', s3_region_name: 'us-east-1', s3_endpoint_url: '' });

  const load = async () => {
    setError('');
    try {
      const data = await apiClient.get<StorageSettings[]>('/api/v1/bbtalk/settings/storage');
      setConfigs(data);
    } catch (e: any) { setError(e.message || '存储配置加载失败，请重试'); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current || error) return;
    busyRef.current = true; setBusy(true);
    try { await action(); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const activate = (id: number) => run(async () => {
    try {
      await apiClient.post(`/api/v1/bbtalk/settings/storage/${id}/activate`);
      xAlert('成功', '新上传的附件将使用此配置，已有附件保持原存储位置'); await load();
    } catch (e: any) { xAlert('失败', e.message); }
  });

  const deactivateAll = () => run(async () => {
    try {
      await apiClient.post('/api/v1/bbtalk/settings/storage/deactivate-all');
      xAlert('成功', '新上传的附件将使用服务器存储，已有附件保持原存储位置'); await load();
    } catch (e: any) { xAlert('失败', e.message); }
  });

  const testConnection = (id: number) => run(async () => {
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(`/api/v1/bbtalk/settings/storage/${id}/test`);
      xAlert(res.success ? '连接成功' : '连接失败', res.message);
    } catch (e: any) { xAlert('测试失败', e.message); }
  });

  const deleteConfig = (id: number) => {
    xConfirm('确认删除', '确定删除此存储配置？', () => run(async () => {
      try { await apiClient.delete(`/api/v1/bbtalk/settings/storage/${id}`); await load(); } catch (e: any) { xAlert('失败', e.message); }
    }), undefined, { confirmText: '删除', destructive: true });
  };

  const createConfig = () => run(async () => {
    if (![form.name, form.s3_bucket_name, form.s3_access_key_id, form.s3_secret_access_key].every(v => v.trim())) {
      xAlert('请补全配置', '配置名称、存储桶、Access Key ID 和 Secret Access Key 都不能为空'); return;
    }
    try {
      await apiClient.post('/api/v1/bbtalk/settings/storage', { ...form, storage_type: 's3' });
      xAlert('成功', '配置已创建，测试连接成功后可激活使用'); setShowAdd(false); setForm({ name: '', s3_access_key_id: '', s3_secret_access_key: '', s3_bucket_name: '', s3_region_name: 'us-east-1', s3_endpoint_url: '' }); await load();
    } catch (e: any) { xAlert('失败', e.message); }
  });

  if (loading) return <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}><LoadingPlaceholder /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" style={[styles.container, { backgroundColor: c.surfaceSecondary }]} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      {!!error && <View style={{ marginBottom: 16 }}>
        <Text accessibilityRole="alert" style={{ color: c.danger }}>{error}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => { setLoading(true); void load(); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.primary }}>重新加载</Text></TouchableOpacity>
      </View>}
      {busy && <View accessibilityRole="progressbar" style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}><ActivityIndicator color={c.primary} /><Text style={{ color: c.textSecondary }}>正在处理，请稍候…</Text></View>}
      <View style={[styles.statusCard, { backgroundColor: c.primaryLight }]}>
        <Ionicons name="server" size={20} color={c.primary} />
        <Text style={[styles.statusText, { color: c.primary }]}>
          当前: {error ? '暂时无法确认' : configs.find(c2 => c2.is_active) ? configs.find(c2 => c2.is_active)!.name : '服务器本地存储'}
        </Text>
      </View>

      <TouchableOpacity disabled={busy || !!error || !configs.some(cfg => cfg.is_active)} style={[styles.optionCard, { backgroundColor: c.cardBg }]} onPress={deactivateAll}>
        <Ionicons name="folder-outline" size={20} color={c.textSecondary} />
        <Text style={[styles.optionText, { color: c.text }]}>使用服务器本地存储</Text>
        {!error && !configs.find(c2 => c2.is_active) && <Ionicons name="checkmark-circle" size={20} color="#10B981" />}
      </TouchableOpacity>

      {configs.map(cfg => (
        <View key={cfg.id} style={[styles.configCard, { backgroundColor: c.cardBg, borderColor: c.borderLight }, cfg.is_active && { borderColor: '#10B981' }]}>
          <View style={styles.configHeader}>
            <Text style={[styles.configName, { color: c.text }]}>{cfg.name}</Text>
            {cfg.is_active && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>已激活</Text></View>}
          </View>
          <Text style={[styles.configDetail, { color: c.textTertiary }]}>桶: {cfg.s3_bucket_name || '-'}</Text>
          <Text style={[styles.configDetail, { color: c.textTertiary }]}>区域: {cfg.s3_region_name || '-'}</Text>
          {cfg.s3_endpoint_url ? <Text style={[styles.configDetail, { color: c.textTertiary }]}>端点: {cfg.s3_endpoint_url}</Text> : null}
          <View style={styles.configActions}>
            {!cfg.is_active && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`激活配置 ${cfg.name}`} disabled={busy || !!error} style={styles.actionBtn} onPress={() => activate(cfg.id)}><Text style={[styles.actionBtnText, { color: c.primary }]}>激活</Text></TouchableOpacity>}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`测试配置 ${cfg.name}`} disabled={busy || !!error} style={styles.actionBtn} onPress={() => testConnection(cfg.id)}><Text style={[styles.actionBtnText, { color: c.primary }]}>测试连接</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`删除配置 ${cfg.name}`} disabled={busy || !!error} style={styles.actionBtn} onPress={() => deleteConfig(cfg.id)}><Text style={[styles.actionBtnText, { color: c.danger }]}>删除</Text></TouchableOpacity>
          </View>
        </View>
      ))}

      {showAdd ? (
        <View style={[styles.addForm, { backgroundColor: c.cardBg }]}>
          <Text style={[styles.addTitle, { color: c.text }]}>新建 S3 配置</Text>
          {[
            { key: 'name', label: '配置名称', placeholder: '例如：阿里云OSS' },
            { key: 's3_access_key_id', label: 'Access Key ID', placeholder: '' },
            { key: 's3_secret_access_key', label: 'Secret Access Key', placeholder: '', secure: true },
            { key: 's3_bucket_name', label: '存储桶名称', placeholder: '' },
            { key: 's3_region_name', label: '区域', placeholder: 'us-east-1' },
            { key: 's3_endpoint_url', label: '端点 URL（可选）', placeholder: 'https://oss-cn-hangzhou.aliyuncs.com' },
          ].map(f => (
            <View key={f.key}>
              <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>{f.label}</Text>
              <TextInput style={[styles.fieldInput, { borderColor: c.border, color: c.text }]} placeholder={f.placeholder} placeholderTextColor={c.textTertiary}
                value={(form as any)[f.key]} onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                accessibilityLabel={f.label} editable={!busy} secureTextEntry={f.secure} autoCapitalize="none" autoCorrect={false} />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity disabled={busy} style={[styles.formBtn, { backgroundColor: c.borderLight, flex: 1 }]} onPress={() => setShowAdd(false)}>
              <Text style={{ color: c.textSecondary, fontWeight: '500' }}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy || !!error} style={[styles.formBtn, { backgroundColor: c.primary, flex: 1 }]} onPress={createConfig}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>创建</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity disabled={busy || !!error} style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add-circle-outline" size={20} color={c.primary} />
          <Text style={[styles.addBtnText, { color: c.primary }]}>添加 S3 存储配置</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  statusText: { flex: 1, fontSize: 14, fontWeight: '500' },
  optionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  optionText: { flex: 1, fontSize: 15 },
  configCard: {
    borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  configHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  configName: { flex: 1, fontSize: 15, fontWeight: '600', marginRight: 8 },
  activeBadge: { backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  activeBadgeText: { fontSize: 11, color: '#059669', fontWeight: '600' },
  configDetail: { fontSize: 12, marginBottom: 2 },
  configActions: { flexDirection: 'row', gap: 12, marginTop: 10 },
  actionBtn: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '500' },
  addForm: {
    borderRadius: 16, padding: 16, marginTop: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  addTitle: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '500', marginBottom: 4, marginTop: 8 },
  fieldInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, height: 44, fontSize: 16 },
  formBtn: { borderRadius: 10, height: 44, justifyContent: 'center', alignItems: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  addBtnText: { fontSize: 14, fontWeight: '500' },
});
