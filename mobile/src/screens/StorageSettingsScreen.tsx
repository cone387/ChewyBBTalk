import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, ActivityIndicator, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../services/api/apiClient';
import type { StorageSettings } from '../types';

export default function StorageSettingsScreen() {
  const insets = useSafeAreaInsets();
  const [configs, setConfigs] = useState<StorageSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', s3_access_key_id: '', s3_secret_access_key: '', s3_bucket_name: '', s3_region_name: 'us-east-1', s3_endpoint_url: '' });

  const load = async () => {
    try {
      const data = await apiClient.get<StorageSettings[]>('/api/v1/bbtalk/settings/storage/');
      setConfigs(data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const activate = async (id: number) => {
    try {
      await apiClient.post(`/api/v1/bbtalk/settings/storage/${id}/activate/`);
      Alert.alert('成功', '已激活'); load();
    } catch (e: any) { Alert.alert('失败', e.message); }
  };

  const deactivateAll = async () => {
    try {
      await apiClient.post('/api/v1/bbtalk/settings/storage/deactivate-all/');
      Alert.alert('成功', '已切换为服务器存储'); load();
    } catch (e: any) { Alert.alert('失败', e.message); }
  };

  const testConnection = async (id: number) => {
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(`/api/v1/bbtalk/settings/storage/${id}/test/`);
      Alert.alert(res.success ? '连接成功' : '连接失败', res.message);
    } catch (e: any) { Alert.alert('测试失败', e.message); }
  };

  const deleteConfig = (id: number) => {
    Alert.alert('确认删除', '确定删除此存储配置？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`/api/v1/bbtalk/settings/storage/${id}/delete/`); load(); } catch (e: any) { Alert.alert('失败', e.message); }
      }},
    ]);
  };

  const createConfig = async () => {
    if (!form.name || !form.s3_bucket_name) { Alert.alert('提示', '请填写名称和存储桶'); return; }
    try {
      await apiClient.post('/api/v1/bbtalk/settings/storage/create/', { ...form, storage_type: 's3' });
      Alert.alert('成功', '配置已创建'); setShowAdd(false); setForm({ name: '', s3_access_key_id: '', s3_secret_access_key: '', s3_bucket_name: '', s3_region_name: 'us-east-1', s3_endpoint_url: '' }); load();
    } catch (e: any) { Alert.alert('失败', e.message); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}>
      {/* 当前状态 */}
      <View style={styles.statusCard}>
        <Ionicons name="server" size={20} color="#059669" />
        <Text style={styles.statusText}>
          当前: {configs.find(c => c.is_active) ? configs.find(c => c.is_active)!.name : '服务器本地存储'}
        </Text>
      </View>

      {/* 使用服务器存储 */}
      <TouchableOpacity style={styles.optionCard} onPress={deactivateAll}>
        <Ionicons name="folder-outline" size={20} color="#6B7280" />
        <Text style={styles.optionText}>使用服务器本地存储</Text>
        {!configs.find(c => c.is_active) && <Ionicons name="checkmark-circle" size={20} color="#10B981" />}
      </TouchableOpacity>

      {/* S3 配置列表 */}
      {configs.map(c => (
        <View key={c.id} style={[styles.configCard, c.is_active && styles.configCardActive]}>
          <View style={styles.configHeader}>
            <Text style={styles.configName}>{c.name}</Text>
            {c.is_active && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>已激活</Text></View>}
          </View>
          <Text style={styles.configDetail}>桶: {c.s3_bucket_name || '-'}</Text>
          <Text style={styles.configDetail}>区域: {c.s3_region_name || '-'}</Text>
          {c.s3_endpoint_url ? <Text style={styles.configDetail}>端点: {c.s3_endpoint_url}</Text> : null}
          <View style={styles.configActions}>
            {!c.is_active && <TouchableOpacity style={styles.actionBtn} onPress={() => activate(c.id)}><Text style={styles.actionBtnText}>激活</Text></TouchableOpacity>}
            <TouchableOpacity style={styles.actionBtn} onPress={() => testConnection(c.id)}><Text style={styles.actionBtnText}>测试</Text></TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => deleteConfig(c.id)}><Text style={[styles.actionBtnText, { color: '#EF4444' }]}>删除</Text></TouchableOpacity>
          </View>
        </View>
      ))}

      {/* 添加配置 */}
      {showAdd ? (
        <View style={styles.addForm}>
          <Text style={styles.addTitle}>新建 S3 配置</Text>
          {[
            { key: 'name', label: '配置名称', placeholder: '例如：阿里云OSS' },
            { key: 's3_access_key_id', label: 'Access Key ID', placeholder: '' },
            { key: 's3_secret_access_key', label: 'Secret Access Key', placeholder: '', secure: true },
            { key: 's3_bucket_name', label: '存储桶名称', placeholder: '' },
            { key: 's3_region_name', label: '区域', placeholder: 'us-east-1' },
            { key: 's3_endpoint_url', label: '端点 URL（可选）', placeholder: 'https://oss-cn-hangzhou.aliyuncs.com' },
          ].map(f => (
            <View key={f.key}>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              <TextInput style={styles.fieldInput} placeholder={f.placeholder} placeholderTextColor="#C4C4C4"
                value={(form as any)[f.key]} onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                secureTextEntry={f.secure} autoCapitalize="none" />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity style={[styles.formBtn, { backgroundColor: '#F3F4F6', flex: 1 }]} onPress={() => setShowAdd(false)}>
              <Text style={{ color: '#6B7280', fontWeight: '500' }}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.formBtn, { flex: 1 }]} onPress={createConfig}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>创建</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add-circle-outline" size={20} color="#059669" />
          <Text style={styles.addBtnText}>添加 S3 存储配置</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4FF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, marginBottom: 12 },
  statusText: { fontSize: 14, color: '#059669', fontWeight: '500' },
  optionCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  optionText: { flex: 1, fontSize: 15, color: '#374151' },
  configCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  configCardActive: { borderColor: '#10B981' },
  configHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  configName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  activeBadge: { backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  activeBadgeText: { fontSize: 11, color: '#059669', fontWeight: '600' },
  configDetail: { fontSize: 12, color: '#9CA3AF', marginBottom: 2 },
  configActions: { flexDirection: 'row', gap: 12, marginTop: 10 },
  actionBtn: { paddingVertical: 4 },
  actionBtnText: { fontSize: 13, color: '#2563EB', fontWeight: '500' },
  addForm: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 4 },
  addTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '500', color: '#6B7280', marginBottom: 4, marginTop: 8 },
  fieldInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 10, height: 40, fontSize: 14, color: '#111827' },
  formBtn: { backgroundColor: '#059669', borderRadius: 10, height: 40, justifyContent: 'center', alignItems: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  addBtnText: { fontSize: 14, color: '#059669', fontWeight: '500' },
});
