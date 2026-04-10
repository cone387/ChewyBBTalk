import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';

interface CacheInfo {
  total: number;
  audio: number;
  video: number;
  image: number;
  other: number;
  fileCount: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

async function scanCacheDir(): Promise<CacheInfo> {
  const info: CacheInfo = { total: 0, audio: 0, video: 0, image: 0, other: 0, fileCount: 0 };
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return info;

  try {
    const files = await FileSystem.readDirectoryAsync(cacheDir);
    for (const file of files) {
      // Only count our own cached files
      if (!file.startsWith('audio_') && !file.startsWith('video_') && !file.startsWith('voice_')) continue;
      try {
        const fInfo = await FileSystem.getInfoAsync(cacheDir + file);
        if (fInfo.exists && !fInfo.isDirectory && fInfo.size) {
          info.fileCount++;
          info.total += fInfo.size;
          const ext = file.split('.').pop()?.toLowerCase() || '';
          if (['m4a', 'mp3', 'aac', 'wav', 'ogg', 'webm', '3gp', 'flac'].includes(ext)) {
            info.audio += fInfo.size;
          } else if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) {
            info.video += fInfo.size;
          } else {
            info.other += fInfo.size;
          }
        }
      } catch {}
    }
  } catch {}
  return info;
}

export default function CacheManagementScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const loadCache = useCallback(async () => {
    setLoading(true);
    const info = await scanCacheDir();
    setCacheInfo(info);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadCache(); }, []));

  // Only delete our own cached media files, not Expo system caches
  const isOurCacheFile = (name: string) => {
    return name.startsWith('audio_') || name.startsWith('video_') || name.startsWith('voice_');
  };

  const clearCache = () => {
    Alert.alert('清理缓存', '将删除所有已下载的音频、视频缓存，不会影响服务器上的数据。', [
      { text: '取消', style: 'cancel' },
      { text: '清理', style: 'destructive', onPress: async () => {
        setClearing(true);
        try {
          const cacheDir = FileSystem.cacheDirectory;
          if (cacheDir) {
            const files = await FileSystem.readDirectoryAsync(cacheDir);
            for (const file of files) {
              if (isOurCacheFile(file)) {
                try { await FileSystem.deleteAsync(cacheDir + file, { idempotent: true }); } catch {}
              }
            }
          }
          await loadCache();
          Alert.alert('完成', '缓存已清理');
        } catch (e: any) {
          Alert.alert('清理失败', e.message);
        } finally {
          setClearing(false);
        }
      }},
    ]);
  };

  const categories = cacheInfo ? [
    { label: '音频', size: cacheInfo.audio, icon: 'musical-notes' as const, color: '#3B82F6' },
    { label: '视频', size: cacheInfo.video, icon: 'videocam' as const, color: '#8B5CF6' },
    { label: '其他', size: cacheInfo.other, icon: 'document' as const, color: '#6B7280' },
  ].filter(c => c.size > 0) : [];

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.surfaceSecondary }]}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}>

      {/* Total */}
      <View style={[styles.totalCard, { backgroundColor: c.cardBg }]}>
        {loading ? (
          <ActivityIndicator size="large" color={c.primary} />
        ) : (
          <>
            <Text style={[styles.totalSize, { color: c.text }]}>{formatSize(cacheInfo?.total || 0)}</Text>
            <Text style={[styles.totalLabel, { color: c.textSecondary }]}>
              缓存总大小 · {cacheInfo?.fileCount || 0} 个文件
            </Text>
          </>
        )}
      </View>

      {/* Categories */}
      {!loading && categories.map(cat => (
        <View key={cat.label} style={[styles.catRow, { backgroundColor: c.cardBg }]}>
          <View style={[styles.catIcon, { backgroundColor: cat.color + '18' }]}>
            <Ionicons name={cat.icon} size={18} color={cat.color} />
          </View>
          <Text style={[styles.catLabel, { color: c.text }]}>{cat.label}</Text>
          <Text style={[styles.catSize, { color: c.textTertiary }]}>{formatSize(cat.size)}</Text>
        </View>
      ))}

      {/* Clear button */}
      {!loading && (cacheInfo?.total || 0) > 0 && (
        <TouchableOpacity
          style={[styles.clearBtn, { backgroundColor: c.dangerBg }]}
          onPress={clearCache}
          disabled={clearing}
          activeOpacity={0.7}
        >
          {clearing ? (
            <ActivityIndicator size="small" color={c.danger} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={18} color={c.danger} />
              <Text style={[styles.clearText, { color: c.danger }]}>清理全部缓存</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <Text style={[styles.hint, { color: c.textTertiary }]}>
        缓存包括已下载的音频、视频等媒体文件，清理后再次播放时会重新下载
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  totalCard: {
    borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  totalSize: { fontSize: 36, fontWeight: '700' },
  totalLabel: { fontSize: 13, marginTop: 6 },
  catRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  catIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  catLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  catSize: { fontSize: 14 },
  clearBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 14, marginTop: 16,
  },
  clearText: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 18 },
});
