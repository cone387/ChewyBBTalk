import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import type { Attachment } from '../types';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  attachment: Attachment;
}

function InlineVideoPlayer({ uri, attachment }: { uri: string; attachment: Attachment }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const player = useVideoPlayer(uri);

  return (
    <View style={styles.videoWrap}>
      <VideoView
        player={player}
        style={styles.videoView}
        allowsPictureInPicture
        contentFit="contain"
        nativeControls
      />
    </View>
  );
}

export default function VideoPlayerButton({ attachment }: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [localUri, setLocalUri] = useState<string | null>(Platform.OS === 'web' ? attachment.url : null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' && !localUri) {
      (async () => {
        setDownloading(true);
        try {
          const ext = (attachment.filename || 'mp4').split('.').pop();
          const dest = FileSystem.cacheDirectory + `video_${attachment.uid}.${ext}`;
          const info = await FileSystem.getInfoAsync(dest);
          if (info.exists) {
            setLocalUri(dest);
          } else {
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
    return <InlineVideoPlayer uri={localUri} attachment={attachment} />;
  }

  return (
    <View style={[styles.loadingWrap, { backgroundColor: c.borderLight, borderColor: c.border }]}>
      {downloading ? (
        <>
          <ActivityIndicator size="small" color="#8B5CF6" />
          <Text style={[styles.loadingText, { color: c.textTertiary }]}>视频加载中...</Text>
        </>
      ) : (
        <TouchableOpacity style={styles.retryBtn} onPress={() => setLocalUri(attachment.url)}>
          <Ionicons name="refresh" size={20} color="#8B5CF6" />
          <Text style={[styles.loadingText, { color: '#8B5CF6' }]}>点击重试</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  videoWrap: { borderRadius: 12, overflow: 'hidden' },
  videoView: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12 },
  loadingWrap: {
    borderRadius: 12, borderWidth: 1, padding: 20,
    alignItems: 'center', justifyContent: 'center',
    aspectRatio: 16 / 9,
  },
  loadingText: { fontSize: 12, marginTop: 6 },
  retryBtn: { alignItems: 'center' },
});
