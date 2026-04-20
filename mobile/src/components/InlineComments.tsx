import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { bbtalkApi } from '../services/api/bbtalkApi';
import { formatTime } from './BBTalkCard';
import { useAppDispatch } from '../store/hooks';
import { decrementCommentCount } from '../store/slices/bbtalkSlice';
import type { Comment } from '../types';
import type { Theme } from '../theme/ThemeContext';

const MAX_COLLAPSED = 3;

interface Props {
  bbtalkId: string;
  commentCount: number;
  /** Externally added comment (from CommentInputModal) — append to list */
  newComment?: Comment | null;
  theme: Theme;
}

export default function InlineComments({ bbtalkId, commentCount, newComment, theme }: Props) {
  const c = theme.colors;
  const dispatch = useAppDispatch();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadComments = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const data = await bbtalkApi.getComments(bbtalkId);
      setComments(data);
      setLoaded(true);
    } catch {} finally {
      setLoading(false);
    }
  }, [bbtalkId, loading]);

  // Auto-load when commentCount > 0 and not yet loaded
  useEffect(() => {
    if (commentCount > 0 && !loaded && !loading) {
      loadComments();
    }
  }, [commentCount, loaded]);

  // Append externally added comment
  useEffect(() => {
    if (newComment) {
      setComments(prev => [...prev, newComment]);
      setLoaded(true);
    }
  }, [newComment]);

  const handleDelete = (comment: Comment) => {
    Alert.alert('删除评论', '确定要删除这条评论吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive', onPress: async () => {
          try {
            await bbtalkApi.deleteComment(bbtalkId, comment.uid);
            setComments(prev => prev.filter(c => c.uid !== comment.uid));
            dispatch(decrementCommentCount(bbtalkId));
          } catch (e: any) {
            Alert.alert('删除失败', e.message);
          }
        },
      },
    ]);
  };

  if (comments.length === 0 && !loading) return null;

  const visible = expanded ? comments : comments.slice(0, MAX_COLLAPSED);
  const hasMore = comments.length > MAX_COLLAPSED;

  return (
    <View style={[styles.container, { borderTopColor: c.border }]}>
      {loading && !loaded ? (
        <ActivityIndicator size="small" color={c.textTertiary} style={{ paddingVertical: 8 }} />
      ) : (
        <>
          {visible.map(comment => (
            <TouchableOpacity
              key={comment.uid}
              style={styles.commentRow}
              activeOpacity={0.7}
              onLongPress={() => handleDelete(comment)}
              delayLongPress={500}
            >
              <Text style={[styles.commentText, { color: c.text }]} numberOfLines={expanded ? undefined : 2}>
                <Text style={[styles.commentAuthor, { color: c.primary }]}>
                  {comment.userDisplayName || comment.userUsername}
                </Text>
                {'：'}
                {comment.content}
              </Text>
              <Text style={[styles.commentTime, { color: c.textTertiary }]}>{formatTime(comment.createdAt)}</Text>
            </TouchableOpacity>
          ))}
          {hasMore && (
            <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.toggleBtn}>
              <Text style={[styles.toggleText, { color: c.primary }]}>
                {expanded ? '收起' : `查看全部 ${comments.length} 条评论`}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 3, gap: 8 },
  commentText: { flex: 1, fontSize: 13, lineHeight: 18 },
  commentAuthor: { fontWeight: '600' },
  commentTime: { fontSize: 11, marginTop: 2 },
  toggleBtn: { paddingVertical: 4 },
  toggleText: { fontSize: 12, fontWeight: '500' },
});
