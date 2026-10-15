import { UI } from '../theme/materials';
import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Markdown, { type RenderRules } from 'react-native-markdown-display';
import type { BBTalk } from '../types';
import { useTheme } from '../theme/ThemeContext';
import { getMarkdownStyles } from '../utils/markdownStyles';
import { buildImageSource } from '../utils/imageSource';

// Calendar previews have one action: open the record with the privacy guard.
// Inline links/images remain text so they cannot bypass that action or load large media.
const previewRules: RenderRules = {
  link: (node, children, _parent, styles) => <Text key={node.key} style={styles.link}>{children}</Text>,
  blocklink: (node, children) => <View key={node.key}>{children}</View>,
  image: (node, _children, _parent, styles) => <Text key={node.key} style={styles.text}>{node.content || '图片'}</Text>,
};

export default memo(function CalendarRecordCard({ item, onOpen }: { item: BBTalk; onOpen: (item: BBTalk) => void }) {
  const { theme: { colors: c } } = useTheme();
  const images = item.attachments.filter(attachment => attachment.type === 'image');
  const files = item.attachments.filter(attachment => attachment.type !== 'image');
  const createdAt = new Date(item.createdAt);
  const time = Number.isNaN(createdAt.getTime()) ? '' : `${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`;
  const isLong = item.content.length > 280 || item.content.split('\n').length > 6;
  const contentBody = useMemo(() => {
    // Match the feed's bounded preview rather than parsing an entire long journal entry.
    if (isLong) {
      const preview = item.content.slice(0, 400).replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/(^|\n)[#>]+\s*/g, '$1').replace(/[*_`]/g, '');
      return <Text numberOfLines={6} style={{ color: c.text, fontSize: 16, lineHeight: 25 }}>{preview}</Text>;
    }
    return <Markdown style={getMarkdownStyles(c)} rules={previewRules}>{item.content}</Markdown>;
  }, [item.content, isLong, c]);

  return <TouchableOpacity accessibilityRole="button" accessibilityHint="打开完整记录，查看图片和附件"
    activeOpacity={0.8} onPress={() => onOpen(item)} style={[styles.card, { backgroundColor: c.cardBg }]}>
    <View style={styles.metadata}>
      <View style={styles.status}>
        {time ? <Text style={[styles.time, { color: c.textSecondary }]}>{time}</Text> : null}
        {item.isPinned && <View style={styles.status}>
          <Ionicons name="pin-outline" size={14} color={c.textSecondary} />
          <Text style={[styles.metaText, { color: c.textSecondary }]}>置顶</Text>
        </View>}
      </View>
      <View style={styles.status}>
        <Ionicons name={item.visibility === 'public' ? 'globe-outline' : item.visibility === 'friends' ? 'people-outline' : 'lock-closed-outline'} size={14} color={c.textSecondary} />
        <Text style={[styles.metaText, { color: c.textSecondary }]}>{item.visibility === 'public' ? '公开可见' : item.visibility === 'friends' ? '好友可见' : '仅自己'}</Text>
      </View>
    </View>
    {contentBody}
    {!!item.tags?.length && <View style={styles.tags}>
      {item.tags.map(tag => <View key={tag.id} style={[styles.tag, { backgroundColor: c.primaryLight }]}>
        <Text style={[styles.tagText, { color: c.text }]}>{tag.name}</Text>
      </View>)}
    </View>}
    {images.length > 0 && <View style={styles.images}>
      {images.slice(0, 4).map((attachment, index) => <View key={attachment.uid} style={{ width: images.length === 1 ? '100%' : '48.5%' }}>
        <Image source={buildImageSource(attachment.url)} style={[styles.thumbnail, { backgroundColor: c.borderLight }]}
          contentFit="cover" cachePolicy="disk" accessibilityLabel={`图片预览 ${index + 1}：${attachment.originalFilename || attachment.filename || '图片'}`} />
        {index === 3 && images.length > 4 && <View style={styles.moreImages}>
          <Text style={styles.moreImageText}>+{images.length - 4}</Text>
        </View>}
      </View>)}
    </View>}
    {files.length > 0 && <View style={styles.files}>
      {files.slice(0, 3).map(attachment => {
        const kind = attachment.type === 'audio' ? '音频' : attachment.type === 'video' ? '视频' : '文件';
        const name = attachment.originalFilename || attachment.filename || kind;
        return <View key={attachment.uid} style={[styles.file, { backgroundColor: c.borderLight }]}>
          <Ionicons name={attachment.type === 'audio' ? 'musical-notes-outline' : attachment.type === 'video' ? 'videocam-outline' : 'document-outline'} size={22} color={c.textSecondary} />
          <View style={styles.fileInfo}>
            <Text numberOfLines={1} style={[styles.fileName, { color: c.text }]}>{name}</Text>
            <Text style={[styles.metaText, { color: c.textSecondary }]}>{kind}{attachment.fileSize ? ` · ${(attachment.fileSize / 1024).toFixed(0)}KB` : ''}</Text>
          </View>
        </View>;
      })}
      {files.length > 3 && <Text style={[styles.metaText, { color: c.textSecondary }]}>还有 {files.length - 3} 个附件</Text>}
    </View>}
    <View style={styles.readMore}>
      <Text style={{ color: c.primary, fontSize: 13 }}>阅读全文</Text>
      <Ionicons name="chevron-forward" size={14} color={c.primary} />
    </View>
  </TouchableOpacity>;
});

const styles = StyleSheet.create({
  card: { padding: 16, marginBottom: 12, borderRadius: UI.radius.card },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  time: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], marginRight: 4 },
  metaText: { fontSize: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 },
  tagText: { fontSize: 12, fontWeight: '500' },
  images: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, marginTop: 12 },
  thumbnail: { width: '100%', aspectRatio: 1.4, borderRadius: 10 },
  moreImages: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  moreImageText: { color: '#fff', fontSize: 24, fontWeight: '600' },
  files: { marginTop: 12, gap: 8 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10 },
  fileInfo: { flex: 1, gap: 3 },
  fileName: { fontSize: 13, fontWeight: '500' },
  readMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 12 },
});
