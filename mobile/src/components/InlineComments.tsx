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

import { commentEntry, loadCommentEntry, invalidateCommentPages } from '../services/commentCache';

const MAX_COLLAPSED = 3;

interface Props {
  bbtalkId: string;
  commentCount: number;
  commentPreview?: Comment[];
  commentsRevision?: string;
  /** Externally added comment (from CommentInputModal) — append to list */
  newComment?: Comment | null;
  theme: Theme;
}

export default function InlineComments({ bbtalkId, commentCount, commentPreview, commentsRevision, newComment, theme }: Props) {
  const c = theme.colors;
  const dispatch = useAppDispatch();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [initialEntry] = useState(() => commentEntry(bbtalkId, commentPreview, commentsRevision));
  const entry = useRef(initialEntry);
  const blockedPreview = useRef<{ value: Comment[] | undefined } | null>(null);
  const previewRef = useRef(commentPreview);
  previewRef.current = commentPreview;
  const identity = useRef({ id: bbtalkId, generation: getSession().generation, revision: commentsRevision });
  const hydrated = useRef(false);
  const [nextPage, setNextPage] = useState(false);
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
    setNextPage(false);
    setLoading(false);
    setLoadError(false);
    setExpanded(false);
  }, []);

  useEffect(() => {
    alive.current = true;
    const unsubscribe = onSessionChange(() => {
      blockedPreview.current = { value: previewRef.current };
      reset();
      setSessionVersion(value => value + 1);
    });
    return () => { alive.current = false; operation.current++; unsubscribe(); };
  }, [reset]);

  const loadComments = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    const currentOperation = operation.current;
    const session = getSession();
    const isCurrent = () => alive.current && operation.current === currentOperation && isCurrentSession(session);
    setLoading(true);
    setLoadError(false);
    try {
      const target = commentEntry(bbtalkId, commentPreview, commentsRevision);
      entry.current = target;
      await loadCommentEntry(bbtalkId, target, commentPreview === undefined);
      if (!isCurrent()) return;
      setComments(target.comments);
      setNextPage(target.next);
      setLoaded(true);
    } catch {
      if (isCurrent()) setLoadError(true);
    } finally {
      if (isCurrent()) {
        fetching.current = false;
        setLoading(false);
      }
    }
  }, [bbtalkId, sessionVersion, commentPreview, commentsRevision]);

  useEffect(() => {
    const previous = identity.current;
    const generation = getSession().generation;
    if (hydrated.current && previous.id === bbtalkId && previous.generation === generation && previous.revision === commentsRevision && !blockedPreview.current) return;
    const keepExpanded = previous.id === bbtalkId && previous.generation === generation && expanded;
    const revisionChanged = previous.revision !== commentsRevision;
    identity.current = { id: bbtalkId, generation, revision: commentsRevision };
    reset();
    if (commentPreview !== undefined && blockedPreview.current?.value === commentPreview) return;
    blockedPreview.current = null;
    hydrated.current = true;
    entry.current = commentEntry(bbtalkId, commentPreview, commentsRevision);
    setComments(entry.current.comments);
    setLoaded(entry.current.loaded);
    setNextPage(entry.current.next);
    setExpanded(keepExpanded);
    if (keepExpanded && revisionChanged && commentCount > entry.current.comments.length) void loadComments();
  }, [bbtalkId, commentPreview, commentsRevision, sessionVersion, reset]);

  // Auto-load when commentCount > 0 and not yet loaded
  useEffect(() => {
    if (commentPreview === undefined && commentCount > 0 && !loaded && !loading && !loadError) {
      loadComments();
    }
  }, [commentCount, commentPreview, loaded, loading, loadError, loadComments]);

  // Append externally added comment
  useEffect(() => {
    if (newComment && !deleted.current.has(newComment.uid)) {
      if (!entry.current.added.has(newComment.uid)) invalidateCommentPages(entry.current);
      entry.current.added.set(newComment.uid, newComment);
      const merged = new Map(entry.current.comments.map(c => [c.uid, c]));
      merged.set(newComment.uid, newComment);
      entry.current.comments = [...merged.values()];
      entry.current.loaded = true;
      setComments(entry.current.comments);
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
            entry.current.deleted.add(comment.uid);
            entry.current.added.delete(comment.uid);
            entry.current.comments = entry.current.comments.filter(c => c.uid !== comment.uid);
            invalidateCommentPages(entry.current);
            setComments(entry.current.comments);
            dispatch(decrementCommentCount({ id: bbtalkId, commentId: comment.uid }));
          } catch (e: any) {
            if (isCurrent()) xAlert('删除失败', e?.message || '请稍后重试');
          } finally {
            pending.delete(comment.uid);
          }
    }, undefined, { confirmText: '删除', destructive: true });
  };

  if (blockedPreview.current?.value === commentPreview && blockedPreview.current) return null;
  if (comments.length === 0 && !loading && !loadError && (commentCount === 0 || commentPreview === undefined)) return null;

  const visible = expanded ? comments : comments.slice(0, MAX_COLLAPSED);
  const total = Math.max(comments.length, commentCount);
  const hasMore = total > MAX_COLLAPSED || total > comments.length;
  const toggleExpanded = () => {
    setExpanded(!expanded);
    if (!expanded && entry.current.next && entry.current.page === 0 && commentCount > comments.length) void loadComments();
  };

  return (
    <View style={[styles.container, { backgroundColor: c.border + '30', borderTopColor: c.border }]}>
      {loading && !loaded ? (
        <ActivityIndicator size="small" color={c.textTertiary} style={{ paddingVertical: 8 }} />
      ) : (
        <>
          {loadError && <TouchableOpacity accessibilityRole="button" accessibilityLabel="重试加载评论" onPress={() => void loadComments()}>
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
          {expanded && nextPage && !loading && (
            <TouchableOpacity accessibilityLabel="加载更多评论" disabled={loading} onPress={() => void loadComments()}>
              <Text style={{ color: c.primary }}>{loading ? '加载中…' : '加载更多评论'}</Text>
            </TouchableOpacity>
          )}
          {hasMore && (
            <TouchableOpacity onPress={toggleExpanded} style={styles.toggleBtn}>
              <Text style={[styles.toggleText, { color: c.primary }]}>
                {expanded ? '收起' : `查看全部 ${total} 条评论`}
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
