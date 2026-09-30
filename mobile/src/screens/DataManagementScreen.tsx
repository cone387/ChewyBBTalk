import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Paths, File as FSFile, Directory } from 'expo-file-system/next';
import { writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAccessToken } from '../services/auth';
import { getApiBaseUrl } from '../config';
import { useTheme } from '../theme/ThemeContext';
import { clearCache } from '../services/offlineCacheService';
import { xAlert, xConfirm } from '../utils/crossAlert';

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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return '已开始下载，请在浏览器下载列表查看文件';
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
    return '文件已生成，请在分享面板中保存或发送';
  }
  return `文件已保存至：${file.uri}`;
}

export default function DataManagementScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const [exporting, setExporting] = useState<'json' | 'zip' | null>(null);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const busyRef = useRef(false);
  const busy = !!exporting || importing || clearing;

  const handleExport = async (format: 'json' | 'zip') => {
    if (busyRef.current) return;
    busyRef.current = true; setExporting(format);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/data/export/?export_format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { xAlert('导出失败', `服务器返回 ${res.status}`); return; }
      const blob = await res.blob();
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const ext = format === 'zip' ? 'zip' : 'json';
      const mime = format === 'zip' ? 'application/zip' : 'application/json';
      const message = await saveAndShare(blob, `bbtalk_export_${ts}.${ext}`, mime);
      xAlert('导出文件已生成', message);
    } catch (e: any) { xAlert('导出失败', e.message); }
    finally { busyRef.current = false; setExporting(null); }
  };

  const handleImport = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'application/zip', 'application/octet-stream', '*/*'],
      });
      if (result.canceled || !result.assets?.length) return;
      const picked = result.assets[0];
      if (!/\.(json|zip)$/i.test(picked.name)) { xAlert('文件格式不支持', '请选择本应用导出的 JSON 或 ZIP 文件'); return; }

      let mimeType = picked.mimeType || 'application/octet-stream';
      if (picked.name.toLowerCase().endsWith('.json')) mimeType = 'application/json';
      else if (picked.name.toLowerCase().endsWith('.zip')) mimeType = 'application/zip';

      const token = await getAccessToken();

      if (Platform.OS === 'web') {
        // Web: fetch URI -> blob -> File 对象
        const blob = await (await fetch(picked.uri)).blob();
        const formData = new FormData();
        formData.append('file', new File([blob], picked.name, { type: mimeType }));
        const res = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/data/import/`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
        });
        if (!res.ok) throw new Error(`导入失败，服务器返回 ${res.status}`);
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
        if (!res.ok) throw new Error(`导入失败，服务器返回 ${res.status}`);
        var data = await res.json();
      }
      if (data.success) {
        const s = data.stats;
        xAlert('导入完成', [
          `标签: 新增 ${s.tags_created}，跳过 ${s.tags_skipped}，共 ${s.tags_created + s.tags_skipped}`,
          `BBTalk: 新增 ${s.bbtalks_created}，跳过 ${s.bbtalks_skipped}，共 ${s.bbtalks_created + s.bbtalks_skipped}`,
          s.errors?.length ? `错误: ${s.errors.length} 条` : '',
        ].filter(Boolean).join('\n'));
      } else {
        xAlert('导入失败', data.error || '未知错误');
      }
    } catch (e: any) { xAlert('导入失败', e.message); }
    finally { busyRef.current = false; setImporting(false); }
  };

  const handleClearCache = () => {
    xConfirm('清除离线缓存', '确定要清除所有离线缓存数据吗？', async () => {
          if (busyRef.current) return;
          busyRef.current = true;
          setClearing(true);
          try {
            await clearCache();
            xAlert('清除成功', '离线缓存已清除');
          } catch (e: any) {
            xAlert('清除失败', e.message);
          } finally {
            busyRef.current = false;
            setClearing(false);
          }
    }, undefined, { confirmText: '确定', destructive: true });
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.surfaceSecondary }]} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <View style={[styles.card, { backgroundColor: c.cardBg }]}>
        <View style={[styles.cardHeader, { backgroundColor: c.borderLight }]}>
          <View style={[styles.headerIcon, { backgroundColor: c.primary }]}><Ionicons name="cloud-download-outline" size={20} color="#fff" /></View>
          <View><Text style={[styles.headerTitle, { color: c.text }]}>导出数据</Text><Text style={[styles.headerSub, { color: c.textSecondary }]}>导出你的碎碎念和标签数据</Text></View>
        </View>
        <View style={styles.cardBody}>
          <TouchableOpacity style={[styles.exportBtn, { borderColor: c.primary, opacity: busy ? 0.5 : 1 }]} onPress={() => handleExport('json')} disabled={busy}>
            {exporting === 'json' ? <ActivityIndicator size="small" color={c.primary} /> : <><Ionicons name="document-text-outline" size={18} color={c.primary} /><Text style={[styles.exportBtnText, { color: c.primary }]}>导出 JSON（不含附件文件）</Text></>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportBtn, { borderColor: c.primary, opacity: busy ? 0.5 : 1 }]} onPress={() => handleExport('zip')} disabled={busy}>
            {exporting === 'zip' ? <ActivityIndicator size="small" color={c.primary} /> : <><Ionicons name="archive-outline" size={18} color={c.primary} /><Text style={[styles.exportBtnText, { color: c.primary }]}>导出 ZIP（含附件）</Text></>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: c.cardBg }]}>
        <View style={[styles.cardHeader, { backgroundColor: c.borderLight }]}>
          <View style={[styles.headerIcon, { backgroundColor: '#EA580C' }]}><Ionicons name="cloud-upload-outline" size={20} color="#fff" /></View>
          <View><Text style={[styles.headerTitle, { color: c.text }]}>导入数据</Text><Text style={[styles.headerSub, { color: c.textSecondary }]}>从 JSON 或 ZIP 文件导入数据</Text></View>
        </View>
        <View style={styles.cardBody}>
          <TouchableOpacity style={[styles.exportBtn, { borderColor: '#EA580C', opacity: busy ? 0.5 : 1 }]} onPress={handleImport} disabled={busy}>
            {importing ? <ActivityIndicator size="small" color="#EA580C" /> : <><Ionicons name="push-outline" size={18} color="#EA580C" /><Text style={[styles.exportBtnText, { color: '#EA580C' }]}>选择文件导入</Text></>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: c.cardBg }]}>
        <View style={[styles.cardHeader, { backgroundColor: c.borderLight }]}>
          <View style={[styles.headerIcon, { backgroundColor: '#DC2626' }]}><Ionicons name="trash-outline" size={20} color="#fff" /></View>
          <View><Text style={[styles.headerTitle, { color: c.text }]}>离线缓存</Text><Text style={[styles.headerSub, { color: c.textSecondary }]}>清除本地缓存的碎碎念数据</Text></View>
        </View>
        <View style={styles.cardBody}>
          <TouchableOpacity style={[styles.exportBtn, { borderColor: '#DC2626', opacity: busy ? 0.5 : 1 }]} onPress={handleClearCache} disabled={busy}>
            {clearing ? <ActivityIndicator size="small" color="#DC2626" /> : <><Ionicons name="trash-bin-outline" size={18} color="#DC2626" /><Text style={[styles.exportBtnText, { color: '#DC2626' }]}>清除离线缓存</Text></>}
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
