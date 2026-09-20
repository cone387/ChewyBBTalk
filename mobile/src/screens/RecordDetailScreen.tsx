import { historyIsLocked, subscribeHistoryPrivacy, recordHistoryActivity } from '../services/historyPrivacy';
import React, { useState, useSyncExternalStore } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Linking, Modal } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAppSelector } from '../store/hooks';
import { getMarkdownStyles } from '../utils/markdownStyles';
import { buildImageSource } from '../utils/imageSource';
import { formatTime } from '../utils/formatTime';
import { xAlert } from '../utils/crossAlert';
import AudioPlayerButton from '../components/AudioPlayerButton';
import VideoPlayerButton from '../components/VideoPlayerButton';
import ImageViewer from '../components/ImageViewer';
import type { BBTalk } from '../types';

export default function RecordDetailScreen() {
  const locked = useSyncExternalStore(subscribeHistoryPrivacy, historyIsLocked, historyIsLocked);
  const navigation = useNavigation<any>();
  const { params } = useRoute<any>();
  const original = params?.item as BBTalk | undefined;
  const item = useAppSelector(s => s.bbtalk.bbtalks.find(b => b.id === original?.id)) || original;
  const { theme } = useTheme(); const c = theme.colors;
  const insets = useSafeAreaInsets();
  const [imageIndex, setImageIndex] = useState<number | null>(null);
  if (locked) return <View style={{ flex: 1, padding: 24, backgroundColor: c.background, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="lock-closed-outline" size={36} color={c.primary} /><Text style={{ color: c.text, marginVertical: 16 }}>记录已锁定</Text><TouchableOpacity accessibilityRole="button" onPress={() => navigation.popToTop()} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: c.primary }}>返回首页解锁</Text></TouchableOpacity></View>;
  if (!item) return <View style={{ flex: 1, padding: 24, backgroundColor: c.background }}><Text style={{ color: c.text }}>请从首页打开一条记录。</Text></View>;
  const images = item.attachments.filter(a => a.type === 'image');
  return <View style={{ flex: 1, backgroundColor: c.background }}>
    <ScrollView onTouchStart={recordHistoryActivity} onScrollBeginDrag={recordHistoryActivity} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 13, color: c.textSecondary }}>{formatTime(item.createdAt)} · {item.visibility === 'public' ? '公开可见' : '仅自己可见'}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Compose', { editItem: item })} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="create-outline" size={18} color={c.primary} /><Text style={{ color: c.primary }}>编辑</Text>
        </TouchableOpacity>
      </View>
      <Markdown style={getMarkdownStyles(c)}>{item.content}</Markdown>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 16 }}>{item.tags.map(tag => <Text key={tag.id} style={{ color: c.primary }}>#{tag.name}</Text>)}</View>
      <View style={{ gap: 12 }}>{item.attachments.map(att => att.type === 'image' ? <TouchableOpacity key={att.uid} accessibilityRole="button" accessibilityLabel="查看照片" onPress={() => setImageIndex(images.findIndex(a => a.uid === att.uid))}>
        <Image source={buildImageSource(att.url)} style={{ width: '100%', height: 260, borderRadius: 12 }} contentFit="contain" />
      </TouchableOpacity> : att.type === 'audio' ? <AudioPlayerButton key={att.uid} attachment={att} /> : att.type === 'video' ? <VideoPlayerButton key={att.uid} attachment={att} /> : <TouchableOpacity key={att.uid} accessibilityRole="button" onPress={() => Linking.openURL(att.url).catch(() => xAlert('无法打开附件', '请稍后重试'))} style={{ padding: 16, borderRadius: 12, backgroundColor: c.surface }}><Text style={{ color: c.primary }}>{att.originalFilename || att.filename || '打开附件'}</Text></TouchableOpacity>)}</View>
    </ScrollView>
    <Modal visible={imageIndex !== null} onRequestClose={() => setImageIndex(null)}>{imageIndex !== null && <View style={{ flex: 1, backgroundColor: '#000' }}><ImageViewer imageUrl={images[imageIndex].url} onClose={() => setImageIndex(null)} /><TouchableOpacity accessibilityRole="button" accessibilityLabel="关闭照片" onPress={() => setImageIndex(null)} style={{ position: 'absolute', top: insets.top + 12, right: 16, padding: 12 }}><Ionicons name="close" size={26} color="#fff" /></TouchableOpacity></View>}</Modal>
  </View>;
}
