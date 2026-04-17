import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { Attachment } from '../types';

interface Props {
  attachment: Attachment;
}

/**
 * VideoPlayerButton — 内联视频播放器。
 * 直接使用远程 URL 播放，依赖 expo-video 的内置缓存和流式加载。
 * 不再预下载整个视频文件。
 */
export default function VideoPlayerButton({ attachment }: Props) {
  const player = useVideoPlayer(attachment.url);

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

const styles = StyleSheet.create({
  videoWrap: { borderRadius: 12, overflow: 'hidden' },
  videoView: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12 },
});
