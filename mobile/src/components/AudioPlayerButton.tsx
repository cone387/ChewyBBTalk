import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import type { Attachment } from '../types';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  attachment: Attachment;
}

// Inner component that plays from a local URI
function PlayerCard({ uri, attachment }: { uri: string; attachment: Attachment }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  const toggle = () => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish) player.seekTo(0);
      player.play();
    }
  };

  const iconName = status.playing ? 'pause' : 'play';
  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;
  const timeLabel = status.playing || status.currentTime > 0
    ? `${Math.floor(status.currentTime)}s / ${Math.floor(status.duration || 0)}s`
    : attachment.fileSize
      ? `音频 · ${(attachment.fileSize / 1024).toFixed(0)}KB`
      : '音频';

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: c.borderLight, borderColor: c.border }]} activeOpacity={0.7} onPress={toggle}>
      <View style={[styles.iconWrap, { backgroundColor: c.primary + '18' }]}>
        <Ionicons name={iconName} size={20} color={c.primary} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
          {attachment.originalFilename || attachment.filename || '语音录音'}
        </Text>
        <View style={styles.progressRow}>
          <View style={[styles.progressBg, { backgroundColor: c.border }]}>
            <View style={[styles.progressFill, { backgroundColor: c.primary, width: `${progress * 100}%` }]} />
          </View>
          <Text style={[styles.meta, { color: c.textTertiary }]}>{timeLabel}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function AudioPlayerButton({ attachment }: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [localUri, setLocalUri] = useState<string | null>(Platform.OS === 'web' ? attachment.url : null);
  const [downloading, setDownloading] = useState(false);

  // Auto-download on native (check cache first)
  useEffect(() => {
    if (Platform.OS !== 'web' && !localUri) {
      (async () => {
        try {
          const ext = (attachment.filename || 'm4a').split('.').pop();
          const dest = FileSystem.cacheDirectory + `audio_${attachment.uid}.${ext}`;
          const info = await FileSystem.getInfoAsync(dest);
          if (info.exists) {
            setLocalUri(dest);
          } else {
            setDownloading(true);
            const result = await FileSystem.downloadAsync(attachment.url, dest);
            setLocalUri(result.uri);
          }
        } catch {
          setLocalUri(attachment.url);
        } finally {
          setDownloading(false);
        }
      })();
    }
  }, []);

  if (localUri) {
    return <PlayerCard uri={localUri} attachment={attachment} />;
  }

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: c.borderLight, borderColor: c.border }]} activeOpacity={0.7} onPress={() => {
      if (!downloading) {
        setDownloading(true);
        const ext = (attachment.filename || 'm4a').split('.').pop();
        const dest = FileSystem.cacheDirectory + `audio_${attachment.uid}.${ext}`;
        FileSystem.downloadAsync(attachment.url, dest)
          .then(r => setLocalUri(r.uri))
          .catch(() => setLocalUri(attachment.url))
          .finally(() => setDownloading(false));
      }
    }}>
      <View style={[styles.iconWrap, { backgroundColor: c.primary + '18' }]}>
        {downloading ? <ActivityIndicator size="small" color={c.primary} /> : <Ionicons name="play" size={20} color={c.primary} />}
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
          {attachment.originalFilename || attachment.filename || '语音录音'}
        </Text>
        <Text style={[styles.meta, { color: c.textTertiary }]}>
          {downloading ? '加载中...' : `音频${attachment.fileSize ? ` · ${(attachment.fileSize / 1024).toFixed(0)}KB` : ''}`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, padding: 10, borderWidth: 1,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1 },
  name: { fontSize: 13, fontWeight: '500' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  progressBg: { flex: 1, height: 3, borderRadius: 1.5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 1.5 },
  meta: { fontSize: 11 },
});
