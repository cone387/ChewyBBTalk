import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { Attachment } from '../types';
import { buildImageSource } from '../utils/imageSource';
import { getSession, isCurrentSession, onSessionChange } from '../services/session';

interface Props {
  attachment: Attachment;
}

/**
 * VideoPlayerButton — 内联视频播放器。
 * Create the streaming player only after a tap; idle feed cards own no decoder.
 */
export default function VideoPlayerButton({ attachment }: Props) {
  const session = React.useSyncExternalStore(onSessionChange, getSession, getSession);
  return <VideoCard key={`${session.generation}:${attachment.uid}:${attachment.url}`} attachment={attachment} />;
}

function VideoCard({ attachment }: Props) {
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState(false);
  const session = React.useRef(getSession()).current;
  const failed = useCallback(() => { setError(true); setRequested(false); }, []);
  const label = `播放视频 ${attachment.originalFilename || attachment.filename || ''}`;
  if (!requested) return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label}
    style={[styles.videoView, styles.placeholder]} onPress={() => {
      if (!isCurrentSession(session)) return;
      setError(false); setRequested(true);
    }}>
    <Text style={styles.playIcon}>▶</Text>
    <Text style={styles.label}>{error ? '视频加载失败，点击重试' : label}</Text>
  </TouchableOpacity>;
  return <View style={styles.videoWrap}>
    <ActiveVideo attachment={attachment} onError={failed} />
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="关闭视频" style={styles.close}
      onPress={() => setRequested(false)}><Text style={styles.label}>关闭视频</Text></TouchableOpacity>
  </View>;
}

function ActiveVideo({ attachment, onError }: Props & { onError: () => void }) {
  const player = useVideoPlayer(buildImageSource(attachment.url));
  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }) => { if (status === 'error') onError(); });
    try { player.play(); } catch { onError(); }
    return () => {
      subscription.remove();
      try { player.pause(); } catch { /* useVideoPlayer also releases on unmount. */ }
    };
  }, [player, onError]);

  return (
    <View style={styles.videoWrap}>
      <VideoView
        player={player}
        style={styles.videoView}
        allowsPictureInPicture
        contentFit="contain"
        nativeControls
        accessibilityLabel={`播放视频 ${attachment.originalFilename || attachment.filename || ''}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  videoWrap: { borderRadius: 12, overflow: 'hidden' },
  videoView: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12 },
  placeholder: { alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  playIcon: { color: '#fff', fontSize: 32 },
  label: { color: '#fff', fontSize: 14 },
  close: { minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#171717' },
});
