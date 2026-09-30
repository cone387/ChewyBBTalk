import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { bbtalkApi } from '../services/api/bbtalkApi';
import { formatTime } from '../utils/formatTime';
import { useAppDispatch } from '../store/hooks';
import { decrementCommentCount } from '../store/slices/bbtalkSlice';
import type { Comment } from '../types';
import type { Theme } from '../theme/ThemeContext';
import { xAlert, xConfirm } from '../utils/crossAlert';
import { getSession, isCurrentSession, onSessionChange } from '../services/session';

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
  const [loadError, setLoadError] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);
  const operation = useRef(0);
  const alive = useRef(true);
  const fetching = useRef(false);
  const deleting = useRef(new Set<string>());
  const deleted = useRef(new Set<string>());

  const reset = useCallback(() => {
    operation.current++;
    fetching.current = false;
    deleting.current = new Set();
    deleted.current = new Set();
    setComments([]);
    setLoaded(false);
    setLoading(false);
    setLoadError(false);
    setExpanded(false);
  }, []);

  useEffect(() => {
    alive.current = true;
    const unsubscribe = onSessionChange(() => {
      reset();
      setSessionVersion(value => value + 1);
    });
    return () => { alive.current = false; operation.current++; unsubscribe(); };
  }, [reset]);

  useEffect(reset, [bbtalkId, reset]);

  const loadComments = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    const currentOperation = operation.current;
    const session = getSession();
    const isCurrent = () => alive.current && operation.current === currentOperation && isCurrentSession(session);
    setLoading(true);
    setLoadError(false);
    try {
      const data = await bbtalkApi.getComments(bbtalkId);
      if (!isCurrent()) return;
      setComments(current => {
        const merged = new Map(data.filter(comment => !deleted.current.has(comment.uid)).map(comment => [comment.uid, comment]));
        current.forEach(comment => { if (!merged.has(comment.uid)) merged.set(comment.uid, comment); });
        return [...merged.values()];
      });
      setLoaded(true);
    } catch {
      if (isCurrent()) setLoadError(true);
    } finally {
      if (isCurrent()) {
        fetching.current = false;
        setLoading(false);
      }
    }
  }, [bbtalkId, sessionVersion]);

  // Auto-load when commentCount > 0 and not yet loaded
  useEffect(() => {
    if (commentCount > 0 && !loaded && !loading && !loadError) {
      loadComments();
    }
  }, [commentCount, loaded, loading, loadError, loadComments]);

  // Append externally added comment
  useEffect(() => {
    if (newComment && !deleted.current.has(newComment.uid)) {
      setComments(prev => prev.some(comment => comment.uid === newComment.uid)
        ? prev.map(comment => comment.uid === newComment.uid ? newComment : comment)
        : [...prev, newComment]);
      setLoaded(true);
    }
  }, [newComment]);

  const handleDelete = (comment: Comment) => {
    const currentOperation = operation.current;
    const session = getSession();
    const pending = deleting.current;
    const isCurrent = () => alive.current && operation.current === currentOperation && isCurrentSession(session);
    xConfirm('删除评论', '确定要删除这条评论吗？', async () => {
          if (!isCurrent() || pending.has(comment.uid)) return;
          pending.add(comment.uid);
          try {
            await bbtalkApi.deleteComment(bbtalkId, comment.uid);
            if (!isCurrent()) return;
            deleted.current.add(comment.uid);
            setComments(prev => prev.filter(c => c.uid !== comment.uid));
            dispatch(decrementCommentCount(bbtalkId));
          } catch (e: any) {
            if (isCurrent()) xAlert('删除失败', e?.message || '请稍后重试');
          } finally {
            pending.delete(comment.uid);
          }
    }, undefined, { confirmText: '删除', destructive: true });
  };

  if (comments.length === 0 && !loading && !loadError) return null;

  const visible = expanded ? comments : comments.slice(0, MAX_COLLAPSED);
  const hasMore = comments.length > MAX_COLLAPSED;

  return (
    <View style={[styles.container, { backgroundColor: c.border + '30', borderTopColor: c.border }]}>
      {loading && !loaded ? (
        <ActivityIndicator size="small" color={c.textTertiary} style={{ paddingVertical: 8 }} />
      ) : (
        <>
          {loadError && <TouchableOpacity accessibilityRole="button" accessibilityLabel="重试加载评论" onPress={loadComments}>
            <Text style={{ color: c.textSecondary }}>评论加载失败，点击重试</Text>
          </TouchableOpacity>}
          {visible.map(comment => (
            <TouchableOpacity
              key={comment.uid}
              style={styles.commentRow}
              activeOpacity={0.7}
              onLongPress={() => handleDelete(comment)}
              delayLongPress={500}
            >
              <Text style={[styles.commentText, { color: c.textSecondary }]} numberOfLines={expanded ? undefined : 2}>
                <Text style={[styles.commentAuthor, { color: c.accent || c.primary }]}>
                  {comment.userDisplayName || comment.userUsername}
                </Text>
                {' · '}
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
  container: { marginTop: 10, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 8, borderRadius: 12, borderTopWidth: 0 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 3, gap: 8 },
  commentText: { flex: 1, fontSize: 13, lineHeight: 18 },
  commentAuthor: { fontWeight: '600' },
  commentTime: { fontSize: 11, marginTop: 2 },
  toggleBtn: { paddingVertical: 4 },
  toggleText: { fontSize: 12, fontWeight: '500' },
});
