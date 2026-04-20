import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Markdown from 'react-native-markdown-display';
import type { BBTalk, Attachment, Comment } from '../types';
import type { Theme } from '../theme/ThemeContext';
import { getMarkdownStyles } from '../utils/markdownStyles';
import AudioPlayerButton from './AudioPlayerButton';
import VideoPlayerButton from './VideoPlayerButton';
import InlineComments from './InlineComments';

export interface BBTalkCardProps {
  item: BBTalk;
  onMenu: (item: BBTalk) => void;
  onEdit: (item: BBTalk) => void;
  onToggleVisibility: (item: BBTalk) => void;
  onImagePreview: (images: string[], index: number) => void;
  onLocationPress: (loc: { latitude: number; longitude: number }) => void;
  onComment: (item: BBTalk) => void;
  /** Newly added comment to append to inline list */
  newComment?: Comment | null;
  theme: Theme;
}

/** Relative time formatting — e.g. "刚刚", "3分钟前", "2天前" */
export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(diff / 86400000);
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

/** Render a non-image attachment (audio / video / file card) */
function renderFileAttachment(att: Attachment, colors: any): React.JSX.Element {
  if (att.type === 'audio') {
    return <AudioPlayerButton key={att.uid} attachment={att} />;
  }
  if (att.type === 'video') {
    return <VideoPlayerButton key={att.uid} attachment={att} />;
  }
  const iconColor = colors.textSecondary;
  return (
    <TouchableOpacity
      key={att.uid}
      style={[styles.fileCard, { backgroundColor: colors.borderLight, borderColor: colors.border }]}
      activeOpacity={0.7}
      onPress={() => Linking.openURL(att.url).catch(() => Alert.alert('提示', '无法打开此文件'))}
    >
      <View style={[styles.fileIconWrap, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name="document-outline" size={20} color={iconColor} />
      </View>
      <View style={styles.fileInfo}>
        <Text style={[styles.fileCardName, { color: colors.text }]} numberOfLines={1}>
          {att.originalFilename || att.filename || '附件'}
        </Text>
        <Text style={[styles.fileCardMeta, { color: colors.textTertiary }]}>
          文件{att.fileSize ? ` · ${(att.fileSize / 1024).toFixed(0)}KB` : ''}
        </Text>
      </View>
      <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

/** Custom comparison function for React.memo — avoids unnecessary re-renders */
export function arePropsEqual(prev: BBTalkCardProps, next: BBTalkCardProps): boolean {
  // Basic fields
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.content !== next.item.content) return false;
  if (prev.item.updatedAt !== next.item.updatedAt) return false;
  if (prev.item.isPinned !== next.item.isPinned) return false;
  if (prev.item.commentCount !== next.item.commentCount) return false;
  if (prev.item.visibility !== next.item.visibility) return false;

  // Tags array
  const pTags = prev.item.tags;
  const nTags = next.item.tags;
  if (pTags.length !== nTags.length) return false;
  for (let i = 0; i < pTags.length; i++) {
    if (pTags[i].id !== nTags[i].id) return false;
  }

  // Attachments array
  const pAtts = prev.item.attachments;
  const nAtts = next.item.attachments;
  if (pAtts.length !== nAtts.length) return false;
  for (let i = 0; i < pAtts.length; i++) {
    if (pAtts[i].uid !== nAtts[i].uid) return false;
  }

  // Callback references
  if (prev.onMenu !== next.onMenu) return false;
  if (prev.onEdit !== next.onEdit) return false;
  if (prev.onToggleVisibility !== next.onToggleVisibility) return false;
  if (prev.onImagePreview !== next.onImagePreview) return false;
  if (prev.onLocationPress !== next.onLocationPress) return false;
  if (prev.onComment !== next.onComment) return false;
  if (prev.newComment !== next.newComment) return false;

  // Theme reference
  if (prev.theme !== next.theme) return false;

  return true;
}

const BBTalkCard = React.memo(function BBTalkCard({
  item,
  onMenu,
  onEdit,
  onToggleVisibility,
  onImagePreview,
  onLocationPress,
  onComment,
  newComment,
  theme,
}: BBTalkCardProps) {
  const c = theme.colors;
  const isMobile = item.context?.source?.platform === 'mobile';
  const loc = item.context?.location as { latitude: number; longitude: number } | undefined;
  const images = item.attachments.filter(a => a.type === 'image');
  const files = item.attachments.filter(a => a.type !== 'image');

  return (
    <View style={[styles.card, { backgroundColor: c.cardBg }]}>
      <TouchableOpacity
        style={styles.moreBtn}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        onPress={() => onMenu(item)}
        accessibilityLabel="更多操作"
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={c.textTertiary} />
      </TouchableOpacity>

      {/* Content area — tap to edit */}
      <TouchableOpacity activeOpacity={0.8} onPress={() => onEdit(item)}>
        {item.isPinned && (
          <View style={styles.pinBadge}>
            <Ionicons name="pin" size={12} color="#F59E0B" />
            <Text style={styles.pinText}>置顶</Text>
          </View>
        )}

        <Markdown style={getMarkdownStyles(c)}>
          {item.content}
        </Markdown>

        {item.tags.length > 0 && (
          <View style={styles.tagRow}>
            {item.tags.map(tag => (
              <View key={tag.id} style={[styles.tag, { backgroundColor: tag.color || '#3B82F6' }]}>
                <Text style={styles.tagText}>{tag.name}</Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>

      {/* Image thumbnails */}
      {images.length > 0 && (
        <View style={styles.imageRow}>
          {images.map((att, idx) => (
            <TouchableOpacity key={att.uid} onPress={() => onImagePreview(images.map(i => i.url), idx)}>
              <Image source={att.url} style={[styles.thumbnail, { backgroundColor: c.borderLight }]} contentFit="cover" cachePolicy="disk" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Non-image attachments */}
      {files.length > 0 && (
        <View style={styles.fileRow}>{files.map(f => renderFileAttachment(f, c))}</View>
      )}

      {/* Footer: time, device icon, location, visibility toggle */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Text style={[styles.time, { color: c.textTertiary }]}>{formatTime(item.createdAt)}</Text>
          <Ionicons
            name={isMobile ? 'phone-portrait-outline' : 'laptop-outline'}
            size={12}
            color={c.borderLight}
          />
          {loc && (
            <TouchableOpacity onPress={() => onLocationPress(loc)} style={{ padding: 2 }}>
              <Ionicons name="location-outline" size={13} color="#10B981" />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.footerRight}>
          <TouchableOpacity onPress={() => onComment(item)} style={styles.commentBtn} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} accessibilityLabel="评论">
            <Ionicons name="chatbubble-outline" size={15} color={c.textTertiary} />
            {(item.commentCount ?? 0) > 0 && (
              <Text style={[styles.commentBtnCount, { color: c.textTertiary }]}>{item.commentCount}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onToggleVisibility(item)} style={styles.visBtn} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} accessibilityLabel={item.visibility === 'public' ? '切换为私密' : '切换为公开'}>
            <Ionicons
              name={item.visibility === 'public' ? 'globe-outline' : 'lock-closed-outline'}
              size={15}
              color={item.visibility === 'public' ? c.primary : c.textTertiary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Inline comments */}
      {((item.commentCount ?? 0) > 0 || newComment) && (
        <InlineComments bbtalkId={item.id} commentCount={item.commentCount ?? 0} newComment={newComment} theme={theme} />
      )}
    </View>
  );
}, arePropsEqual);

export default BBTalkCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 16, padding: 16, marginTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  moreBtn: { position: 'absolute', top: 14, right: 14, zIndex: 10, padding: 6 },
  pinBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    marginBottom: 6, alignSelf: 'flex-start',
  },
  pinText: { fontSize: 11, color: '#F59E0B', fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  thumbnail: { width: 100, height: 100, borderRadius: 10 },
  fileRow: { marginTop: 12, gap: 8 },
  fileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, padding: 10,
    borderWidth: 1,
  },
  fileIconWrap: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  fileInfo: { flex: 1 },
  fileCardName: { fontSize: 13, fontWeight: '500' },
  fileCardMeta: { fontSize: 11, marginTop: 1 },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 12,
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  time: { fontSize: 12 },
  commentBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, padding: 10 },
  commentBtnCount: { fontSize: 12 },
  visBtn: { padding: 10 },
});
