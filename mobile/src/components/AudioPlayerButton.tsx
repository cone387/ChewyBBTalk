import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import type { Attachment } from '../types';
import { useTheme } from '../theme/ThemeContext';
import { buildImageSource } from '../utils/imageSource';
import { getSession, isCurrentSession, onSessionChange } from '../services/session';
import { audioCachePath, audioStagingPath } from '../services/audioCache';

function downloadHeaders(url: string) {
  const source = buildImageSource(url);
  return typeof source === 'string' ? undefined : source.headers;
}

interface Props {
  attachment: Attachment;
}

// Inner component that plays from a local URI
function PlayerCard({ uri, attachment, autoPlay = false }: { uri: string; attachment: Attachment; autoPlay?: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const player = useAudioPlayer(buildImageSource(uri));
  const status = useAudioPlayerStatus(player);
  const started = useRef(false);
  useEffect(() => () => { try { player.pause(); } catch {} }, [player]);
  useEffect(() => {
    if (!autoPlay || !status.isLoaded || started.current) return;
    started.current = true;
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    player.play();
  }, [autoPlay, status.isLoaded, player]);

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
    <TouchableOpacity style={[styles.card, { backgroundColor: c.borderLight, borderColor: c.border }]} activeOpacity={0.7} onPress={toggle} accessibilityRole="button" accessibilityLabel={`${status.playing ? '暂停' : '播放'}音频 ${attachment.originalFilename || attachment.filename || ''}`}>
      <View style={[styles.iconWrap, { backgroundColor: c.primary + '18' }]}>
        <Ionicons name={iconName} size={20} color={c.primary} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
          {/^voice_\d+/.test(attachment.originalFilename || attachment.filename || '') ? '语音记录' : attachment.originalFilename || attachment.filename || '语音记录'}
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
  const session = React.useSyncExternalStore(onSessionChange, getSession, getSession);
  return <AudioCard key={`${session.generation}:${attachment.uid}:${attachment.url}`} attachment={attachment} />;
}

function AudioCard({ attachment }: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [localUri, setLocalUri] = useState<string | null>(Platform.OS === 'web' ? attachment.url : null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [autoPlay, setAutoPlay] = useState(false);
  const [requested, setRequested] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const session = useRef(getSession()).current;
  const current = () => alive.current && isCurrentSession(session);
  const dest = audioCachePath(attachment, session.scope);

  // Listing records only probes the local cache; network work requires a tap.
  useEffect(() => {
    alive.current = true;
    if (Platform.OS !== 'web') {
      void FileSystem.getInfoAsync(dest).then(info => {
        if (current() && !busy.current && info.exists) setLocalUri(dest);
      }).catch(() => { /* A cache miss never triggers a network request. */ });
    }
    return () => { alive.current = false; };
  }, []);

  const load = async () => {
    if (busy.current || !current()) return;
    if (localUri) { setAutoPlay(true); setRequested(true); return; }
    busy.current = true; setDownloading(true); setError('');
    const staging = audioStagingPath(dest);
    try {
      const result = await FileSystem.downloadAsync(attachment.url, staging, { headers: downloadHeaders(attachment.url) });
      if (!(result.status >= 200 && result.status < 300)) throw new Error(`音频下载失败 (${result.status})`);
      if (!current()) return;
      try { await FileSystem.moveAsync({ from: staging, to: dest }); }
      catch (error) {
        // Another card may have completed the same audio while this one downloaded.
        if (!(await FileSystem.getInfoAsync(dest)).exists) throw error;
      }
      if (current()) { setAutoPlay(true); setLocalUri(dest); setRequested(true); }
    } catch (e: any) {
      if (current()) setError(`${e.message || '音频下载失败'}，点击重试`);
    } finally {
      await FileSystem.deleteAsync(staging, { idempotent: true }).catch(() => {});
      busy.current = false;
      if (current()) setDownloading(false);
    }
  };

  if (requested && localUri) {
    return <PlayerCard uri={localUri} attachment={attachment} autoPlay={autoPlay} />;
  }

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: c.borderLight, borderColor: c.border }]} activeOpacity={0.7}
      accessibilityRole="button" accessibilityLabel={`${error ? '重试' : '播放'}音频 ${attachment.originalFilename || attachment.filename || ''}`}
      disabled={downloading} onPress={load}>
      <View style={[styles.iconWrap, { backgroundColor: c.primary + '18' }]}>
        {downloading ? <ActivityIndicator size="small" color={c.primary} /> : <Ionicons name="play" size={20} color={c.primary} />}
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
          {/^voice_\d+/.test(attachment.originalFilename || attachment.filename || '') ? '语音记录' : attachment.originalFilename || attachment.filename || '语音记录'}
        </Text>
        <Text style={[styles.meta, { color: c.textTertiary }]}>
          {downloading ? '加载中...' : error || `音频${attachment.fileSize ? ` · ${(attachment.fileSize / 1024).toFixed(0)}KB` : ''}`}
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
  meta: { fontSize: 12 },
});
