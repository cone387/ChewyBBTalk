import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Paths, File as FSFile, Directory } from 'expo-file-system/next';
import { writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAccessToken } from '../services/auth';
import { getApiBaseUrl } from '../config';
import { useTheme } from '../theme/ThemeContext';

// blob -> base64
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// blob -> text
function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

async function saveAndShare(blob: Blob, fileName: string, mimeType: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
    return;
  }

  // 写文件
  const exportDir = new Directory(Paths.document, 'bbtalk_exports');
  if (!exportDir.exists) exportDir.create();
  const file = new FSFile(exportDir, fileName);

  if (mimeType === 'application/json') {
    file.write(await blobToText(blob));
  } else {
    // 二进制(ZIP)：用 legacy API 写 base64 -> 真正的二进制文件
    const base64 = await blobToBase64(blob);
    await writeAsStringAsync(file.uri, base64, { encoding: 'base64' });
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: '导出数据' });
  }
}

export default function DataManagementScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async (format: 'json' | 'zip') => {
    setExporting(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/data/export/?export_format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { Alert.alert('导出失败', `服务器返回 ${res.status}`); return; }
      const blob = await res.blob();
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const ext = format === 'zip' ? 'zip' : 'json';
      const mime = format === 'zip' ? 'application/zip' : 'application/json';
      await saveAndShare(blob, `bbtalk_export_${ts}.${ext}`, mime);
      Alert.alert('导出成功', '文件已准备好');
    } catch (e: any) { Alert.alert('导出失败', e.message); }
    finally { setExporting(false); }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'application/zip', 'application/octet-stream', '*/*'],
      });
      if (result.canceled || !result.assets?.length) return;
      const picked = result.assets[0];
      setImporting(true);

      let mimeType = picked.mimeType || 'application/octet-stream';
      if (picked.name.endsWith('.json')) mimeType = 'application/json';
      else if (picked.name.endsWith('.zip')) mimeType = 'application/zip';

      const token = await getAccessToken();

      if (Platform.OS === 'web') {
        // Web: fetch URI -> blob -> File 对象
        const blob = await (await fetch(picked.uri)).blob();
        const formData = new FormData();
        formData.append('file', new File([blob], picked.name, { type: mimeType }));
        const res = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/data/import/`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
        });
        var data = await res.json();
      } else {
        // Native: 用 fetch + FormData，RN fetch 原生支持 file:// URI
        const formData = new FormData();
        formData.append('file', { uri: picked.uri, name: picked.name, type: mimeType } as any);
        const res = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/data/import/`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        var data = await res.json();
      }
      if (data.success) {
        const s = data.stats;
        Alert.alert('导入完成', [
          `标签: 新增 ${s.tags_created}，跳过 ${s.tags_skipped}，共 ${s.tags_created + s.tags_skipped}`,
          `BBTalk: 新增 ${s.bbtalks_created}，跳过 ${s.bbtalks_skipped}，共 ${s.bbtalks_created + s.bbtalks_skipped}`,
          s.errors?.length ? `错误: ${s.errors.length} 条` : '',
        ].filter(Boolean).join('\n'));
      } else {
        Alert.alert('导入失败', data.error || '未知错误');
      }
    } catch (e: any) { Alert.alert('导入失败', e.message); }
    finally { setImporting(false); }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.surfaceSecondary }]} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}>
      <View style={[styles.card, { backgroundColor: c.cardBg }]}>
        <View style={[styles.cardHeader, { backgroundColor: c.borderLight }]}>
          <View style={[styles.headerIcon, { backgroundColor: c.primary }]}><Ionicons name="cloud-download-outline" size={20} color="#fff" /></View>
          <View><Text style={[styles.headerTitle, { color: c.text }]}>导出数据</Text><Text style={[styles.headerSub, { color: c.textSecondary }]}>导出你的碎碎念和标签数据</Text></View>
        </View>
        <View style={styles.cardBody}>
          <TouchableOpacity style={[styles.exportBtn, { borderColor: c.primary }]} onPress={() => handleExport('json')} disabled={exporting}>
            {exporting ? <ActivityIndicator size="small" color={c.primary} /> : <><Ionicons name="document-text-outline" size={18} color={c.primary} /><Text style={[styles.exportBtnText, { color: c.primary }]}>导出 JSON</Text></>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportBtn, { borderColor: c.primary }]} onPress={() => handleExport('zip')} disabled={exporting}>
            {exporting ? <ActivityIndicator size="small" color={c.primary} /> : <><Ionicons name="archive-outline" size={18} color={c.primary} /><Text style={[styles.exportBtnText, { color: c.primary }]}>导出 ZIP（含附件）</Text></>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: c.cardBg }]}>
        <View style={[styles.cardHeader, { backgroundColor: c.borderLight }]}>
          <View style={[styles.headerIcon, { backgroundColor: '#EA580C' }]}><Ionicons name="cloud-upload-outline" size={20} color="#fff" /></View>
          <View><Text style={[styles.headerTitle, { color: c.text }]}>导入数据</Text><Text style={[styles.headerSub, { color: c.textSecondary }]}>从 JSON 或 ZIP 文件导入数据</Text></View>
        </View>
        <View style={styles.cardBody}>
          <TouchableOpacity style={[styles.exportBtn, { borderColor: '#EA580C' }]} onPress={handleImport} disabled={importing}>
            {importing ? <ActivityIndicator size="small" color="#EA580C" /> : <><Ionicons name="push-outline" size={18} color="#EA580C" /><Text style={[styles.exportBtnText, { color: '#EA580C' }]}>选择文件导入</Text></>}
          </TouchableOpacity>
        </View>
      </View>
      <Text style={[styles.hint, { color: c.textTertiary }]}>导出的数据可用于跨服务器迁移或备份</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  headerSub: { fontSize: 12, marginTop: 2 },
  cardBody: { padding: 16, gap: 10 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, height: 44,
  },
  exportBtnText: { fontSize: 14, fontWeight: '500' },
  hint: { textAlign: 'center', fontSize: 12, marginTop: 16 },
});
