import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';

export default function AudioPlayScreen() {
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const { url, name } = route.params as { url: string; name: string };

  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Download file first on native (AVPlayer needs Range support which our server lacks)
  useEffect(() => {
    if (Platform.OS === 'web') {
      setLocalUri(url);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ext = name.split('.').pop() || 'm4a';
        const dest = FileSystem.cacheDirectory + `audio_${Date.now()}.${ext}`;
        const result = await FileSystem.downloadAsync(url, dest);
        if (!cancelled) setLocalUri(result.uri);
      } catch (e: any) {
        if (!cancelled) setError(e.message || '下载失败');
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
        <View style={styles.content}>
          <Ionicons name="alert-circle" size={48} color={c.danger} />
          <Text style={[styles.name, { color: c.danger, marginTop: 16 }]}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!localUri) {
    return (
      <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text style={[styles.loading, { color: c.textTertiary }]}>下载音频中...</Text>
        </View>
      </View>
    );
  }

  return <AudioPlayerUI uri={localUri} name={name} />;
}

function AudioPlayerUI({ uri, name }: { uri: string; name: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  }, []);

  const toggle = () => {
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish) player.seekTo(0);
      player.play();
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: c.primary + '20' }]}>
          <Ionicons name="musical-notes" size={48} color={c.primary} />
        </View>

        <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>{name}</Text>

        <View style={[styles.progressBg, { backgroundColor: c.border }]}>
          <View style={[styles.progressFill, { backgroundColor: c.primary, width: `${progress * 100}%` }]} />
        </View>

        <View style={styles.timeRow}>
          <Text style={[styles.time, { color: c.textTertiary }]}>{formatTime(status.currentTime)}</Text>
          <Text style={[styles.time, { color: c.textTertiary }]}>{formatTime(status.duration || 0)}</Text>
        </View>

        <TouchableOpacity style={[styles.playBtn, { backgroundColor: c.primary }]} onPress={toggle} activeOpacity={0.8}>
          <Ionicons name={status.playing ? 'pause' : 'play'} size={36} color="#fff" />
        </TouchableOpacity>

        {!status.isLoaded && (
          <View style={{ marginTop: 16, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={c.primary} />
            <Text style={[styles.loading, { color: c.textTertiary }]}>准备播放...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconCircle: {
    width: 120, height: 120, borderRadius: 60,
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
  },
  name: { fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 32 },
  progressBg: { width: '100%', height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 8 },
  time: { fontSize: 12 },
  playBtn: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: 'center', alignItems: 'center', marginTop: 32,
  },
  loading: { fontSize: 13, marginTop: 12 },
});
