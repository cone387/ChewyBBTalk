import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { getMarkdownStyles } from '../utils/markdownStyles';
import { bbtalkApi } from '../services/api/bbtalkApi';
import { formatTime } from '../components/BBTalkCard';
import type { BBTalk, Comment } from '../types';

export default function BBTalkDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const inputRef = useRef<TextInput>(null);

  const item: BBTalk = route.params?.item;
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      const data = await bbtalkApi.getComments(item.id);
      setComments(data);
    } catch (e: any) {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [item.id]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const handleSubmitComment = async () => {
    const text = newComment.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const comment = await bbtalkApi.createComment(item.id, text);
      setComments(prev => [...prev, comment]);
      setNewComment('');
    } catch (e: any) {
      Alert.alert('发送失败', e.message || '请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = (comment: Comment) => {
    Alert.alert('删除评论', '确定要删除这条评论吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive', onPress: async () => {
          try {
            await bbtalkApi.deleteComment(item.id, comment.uid);
            setComments(prev => prev.filter(c => c.uid !== comment.uid));
          } catch (e: any) {
            Alert.alert('删除失败', e.message);
          }
        },
      },
    ]);
  };

  const images = item.attachments.filter(a => a.type === 'image');

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.surfaceSecondary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 20 }]}>
        {/* 碎碎念内容 */}
        <View style={[styles.contentCard, { backgroundColor: c.cardBg }]}>
          {item.isPinned && (
            <View style={styles.pinBadge}>
              <Ionicons name="pin" size={12} color="#F59E0B" />
              <Text style={styles.pinText}>置顶</Text>
            </View>
          )}

          <Markdown style={getMarkdownStyles(c)}>{item.content}</Markdown>

          {item.tags.length > 0 && (
            <View style={styles.tagRow}>
              {item.tags.map(tag => (
                <View key={tag.id} style={[styles.tag, { backgroundColor: tag.color || '#3B82F6' }]}>
                  <Text style={styles.tagText}>{tag.name}</Text>
                </View>
              ))}
            </View>
          )}

          {images.length > 0 && (
            <View style={styles.imageRow}>
              {images.map(att => (
                <Image key={att.uid} source={att.url} style={[styles.thumbnail, { backgroundColor: c.borderLight }]} contentFit="cover" />
              ))}
            </View>
          )}

          <View style={styles.meta}>
            <Text style={[styles.metaTime, { color: c.textTertiary }]}>{formatTime(item.createdAt)}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Compose', { editItem: item })} style={styles.editBtn}>
              <Ionicons name="create-outline" size={16} color={c.primary} />
              <Text style={[styles.editText, { color: c.primary }]}>编辑</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 评论区 */}
        <View style={styles.commentSection}>
          <Text style={[styles.commentTitle, { color: c.text }]}>
            评论 {comments.length > 0 ? `(${comments.length})` : ''}
          </Text>

          {loading ? (
            <ActivityIndicator style={{ paddingVertical: 20 }} color={c.primary} />
          ) : comments.length === 0 ? (
            <Text style={[styles.emptyComment, { color: c.textTertiary }]}>暂无评论，来说点什么吧</Text>
          ) : (
            comments.map(comment => (
              <View key={comment.uid} style={[styles.commentItem, { backgroundColor: c.cardBg }]}>
                <View style={styles.commentHeader}>
                  <View style={styles.commentUser}>
                    {comment.userAvatar ? (
                      <Image source={comment.userAvatar} style={styles.commentAvatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.commentAvatar, { backgroundColor: c.avatarBg }]}>
                        <Text style={styles.commentAvatarText}>
                          {(comment.userDisplayName || comment.userUsername || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={[styles.commentName, { color: c.text }]}>
                      {comment.userDisplayName || comment.userUsername}
                    </Text>
                  </View>
                  <View style={styles.commentActions}>
                    <Text style={[styles.commentTime, { color: c.textTertiary }]}>{formatTime(comment.createdAt)}</Text>
                    <TouchableOpacity onPress={() => handleDeleteComment(comment)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={14} color={c.textTertiary} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={[styles.commentContent, { color: c.text }]}>{comment.content}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* 评论输入框 */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8, backgroundColor: c.cardBg, borderTopColor: c.border }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.text }]}
          placeholder="写一条评论..."
          placeholderTextColor={c.textTertiary}
          value={newComment}
          onChangeText={setNewComment}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: newComment.trim() ? c.primary : c.border }]}
          onPress={handleSubmitComment}
          disabled={!newComment.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16 },
  contentCard: {
    borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  pinBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 },
  pinText: { fontSize: 11, color: '#F59E0B', fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  thumbnail: { width: 100, height: 100, borderRadius: 10 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' },
  metaTime: { fontSize: 13 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editText: { fontSize: 13, fontWeight: '500' },
  commentSection: { marginTop: 20 },
  commentTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  emptyComment: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  commentItem: {
    borderRadius: 12, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  commentUser: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  commentAvatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  commentName: { fontSize: 13, fontWeight: '600' },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  commentTime: { fontSize: 11 },
  commentContent: { fontSize: 14, lineHeight: 20 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
});
