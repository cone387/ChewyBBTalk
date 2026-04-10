import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import type { Attachment } from '../types';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  attachment: Attachment;
}

export default function VideoPlayerButton({ attachment }: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [localUri, setLocalUri] = useState<string | null>(Platform.OS === 'web' ? attachment.url : null);
  const [downloading, setDownloading] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

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

  return (
    <>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: c.borderLight, borderColor: c.border }]}
        activeOpacity={0.7}
        onPress={() => localUri && setShowPlayer(true)}
      >
        <View style={[styles.iconWrap, { backgroundColor: '#8B5CF6' + '18' }]}>
          {downloading ? <ActivityIndicator size="small" color="#8B5CF6" /> : <Ionicons name="videocam" size={20} color="#8B5CF6" />}
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
            {attachment.originalFilename || attachment.filename || '视频'}
          </Text>
          <Text style={[styles.meta, { color: c.textTertiary }]}>
            {downloading ? '下载中...' : `视频${attachment.fileSize ? ` · ${(attachment.fileSize / 1048576).toFixed(1)}MB` : ''}`}
          </Text>
        </View>
        <Ionicons name="play-circle-outline" size={20} color="#8B5CF6" />
      </TouchableOpacity>

      {showPlayer && localUri && (
        <VideoPlayerModal uri={localUri} onClose={() => setShowPlayer(false)} />
      )}
    </>
  );
}

function VideoPlayerModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <VideoView
          player={player}
          style={styles.video}
          allowsFullscreen
          allowsPictureInPicture
        />
      </View>
    </Modal>
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
  meta: { fontSize: 11, marginTop: 1 },
  modalOverlay: {
    flex: 1, backgroundColor: '#000',
    justifyContent: 'center', alignItems: 'center',
  },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  video: { width: '100%', height: 300 },
});
