import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAccessToken } from '../services/auth';
import { getApiBaseUrl } from '../config';

export default function DataManagementScreen() {
  const insets = useSafeAreaInsets();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async (format: 'json' | 'zip') => {
    setExporting(true);
    try {
      const token = await getAccessToken();
      const url = `${getApiBaseUrl()}/api/v1/bbtalk/data/export/?export_format=${format}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { Alert.alert('导出失败', '请稍后重试'); return; }
      const blob = await res.blob();
      // On mobile, share the blob via expo-sharing if possible
      Alert.alert('导出成功', `数据已准备好 (${(blob.size / 1024).toFixed(0)}KB)。\n\n提示：完整的文件导出功能请使用 Web 版本。`);
    } catch (e: any) { Alert.alert('导出失败', e.message); }
    finally { setExporting(false); }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'application/zip'] });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      setImporting(true);

      const token = await getAccessToken();
      const formData = new FormData();
      formData.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);

      const res = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/data/import/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        const s = data.stats;
        Alert.alert('导入成功', `标签: ${s.tags_created} 条\nBBTalk: ${s.bbtalks_created} 条${s.errors?.length ? `\n错误: ${s.errors.length}` : ''}`);
      } else {
        Alert.alert('导入失败', data.error || '未知错误');
      }
    } catch (e: any) { Alert.alert('导入失败', e.message); }
    finally { setImporting(false); }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.headerIcon, { backgroundColor: '#2563EB' }]}><Ionicons name="cloud-download-outline" size={20} color="#fff" /></View>
          <View><Text style={styles.headerTitle}>导出数据</Text><Text style={styles.headerSub}>导出你的碎碎念和标签数据</Text></View>
        </View>
        <View style={styles.cardBody}>
          <TouchableOpacity style={styles.exportBtn} onPress={() => handleExport('json')} disabled={exporting}>
            {exporting ? <ActivityIndicator size="small" color="#2563EB" /> : <><Ionicons name="document-text-outline" size={18} color="#2563EB" /><Text style={styles.exportBtnText}>导出 JSON</Text></>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportBtn} onPress={() => handleExport('zip')} disabled={exporting}>
            {exporting ? <ActivityIndicator size="small" color="#2563EB" /> : <><Ionicons name="archive-outline" size={18} color="#2563EB" /><Text style={styles.exportBtnText}>导出 ZIP（含附件）</Text></>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.headerIcon, { backgroundColor: '#EA580C' }]}><Ionicons name="cloud-upload-outline" size={20} color="#fff" /></View>
          <View><Text style={styles.headerTitle}>导入数据</Text><Text style={styles.headerSub}>从 JSON 或 ZIP 文件导入数据</Text></View>
        </View>
        <View style={styles.cardBody}>
          <TouchableOpacity style={[styles.exportBtn, { borderColor: '#EA580C' }]} onPress={handleImport} disabled={importing}>
            {importing ? <ActivityIndicator size="small" color="#EA580C" /> : <><Ionicons name="push-outline" size={18} color="#EA580C" /><Text style={[styles.exportBtnText, { color: '#EA580C' }]}>选择文件导入</Text></>}
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.hint}>导出的数据可用于跨服务器迁移或备份</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4FF' },
  card: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#F9FAFB' },
  headerIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  cardBody: { padding: 16, gap: 10 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: '#2563EB', borderRadius: 10, height: 44,
  },
  exportBtnText: { fontSize: 14, color: '#2563EB', fontWeight: '500' },
  hint: { textAlign: 'center', fontSize: 12, color: '#9CA3AF', marginTop: 16 },
});
