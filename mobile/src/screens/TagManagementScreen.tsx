import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
} from 'react-native';
import DragList from 'react-native-draglist';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { xAlert, xConfirm, xActionSheet } from '../utils/crossAlert';
import { tagApi } from '../services/api/tagApi';
import { useAppDispatch } from '../store/hooks';
import { setTags as setStoreTags } from '../store/slices/tagSlice';
import EmptyState from '../components/EmptyState';
import LoadingPlaceholder from '../components/LoadingPlaceholder';
import type { Tag } from '../types';
import { getSession, isCurrentSession } from '../services/session';

const PRESET_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B',
  '#10B981', '#06B6D4', '#6366F1', '#F97316', '#84CC16',
];

export default function TagManagementScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const dispatch = useAppDispatch();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [orderStatus, setOrderStatus] = useState('');
  const session = useRef(getSession()).current;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try { const result = await tagApi.getTags(); if (!isCurrentSession(session)) return; setTags(result); dispatch(setStoreTags(result)); }
    catch (e: any) { if (isCurrentSession(session)) setError(e.message || '标签加载失败，请重试'); }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const startEdit = (tag: Tag) => { if (busyRef.current) return; setEditingId(tag.id); setEditName(tag.name); setEditColor(tag.color); };
  const cancelEdit = () => { setEditingId(null); };
  const mutate = async (action: () => Promise<void>) => {
    if (busyRef.current || !isCurrentSession(session)) return;
    busyRef.current = true; setBusy(true);
    try { await action(); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const saveEdit = () => mutate(async () => {
    if (!editingId || !editName.trim()) return;
    try {
      await tagApi.updateTag(editingId, { name: editName.trim(), color: editColor });
      if (!isCurrentSession(session)) return;
      cancelEdit(); await load(true);
    } catch (e: any) { if (isCurrentSession(session)) xAlert('保存失败', e.message); }
  });

  const deleteTag = (tag: Tag) => {
    const options: { text: string; action: () => void; destructive?: boolean }[] = [
      { text: '仅删除标签，保留记录', action: () => mutate(async () => {
        try { await tagApi.deleteTag(tag.id, false); if (isCurrentSession(session)) await load(true); }
        catch (e: any) { if (isCurrentSession(session)) xAlert('删除失败', e.message); }
      })},
    ];
    if (tag.bbtalkCount && tag.bbtalkCount > 0) {
      options.push({ text: '同时删除碎碎念', destructive: true, action: () => {
        xConfirm('删除标签和记录', `将永久删除「${tag.name}」及其关联的 ${tag.bbtalkCount} 条记录，不可恢复！`, () => mutate(async () => {
          try { await tagApi.deleteTag(tag.id, true); if (isCurrentSession(session)) await load(true); }
          catch (e: any) { if (isCurrentSession(session)) xAlert('删除失败', e.message); }
        }), undefined, { confirmText: '确认删除', destructive: true });
      }});
    }
    xActionSheet(`删除「${tag.name}」？（关联 ${tag.bbtalkCount || 0} 条碎碎念）`, options, (index) => {
      options[index].action();
    });
  };

  const reorder = (from: number, to: number) => {
    const target = Math.min(to, tags.length - 1);
    if (busyRef.current || editingId || from === target || from < 0 || from >= tags.length || target < 0) return;
    // Update immediately; do not keep the dragged row floating during the request.
    void mutate(async () => {
      const previous = tags;
      const reordered = [...tags];
      reordered.splice(target, 0, reordered.splice(from, 1)[0]);
      const newTags = reordered.map((tag, index) => ({ ...tag, sortOrder: index }));
      setTags(newTags); dispatch(setStoreTags(newTags)); setOrderStatus('正在保存顺序…');
      try {
        await tagApi.reorder(newTags.map((t, i) => ({ uid: t.id, sort_order: i })));
        if (isCurrentSession(session)) { dispatch(setStoreTags(newTags)); setOrderStatus('顺序已保存'); }
      } catch (e: any) {
        if (!isCurrentSession(session)) return;
        setTags(previous); dispatch(setStoreTags(previous)); setOrderStatus('未能保存，已恢复原顺序');
        xAlert('排序失败', e.message || '顺序没有保存，请重试');
      }
    });
  };

  const showActions = (tag: Tag) => {
    if (busyRef.current || dragging) return;
    xActionSheet(`「${tag.name}」`, [
      { text: '编辑名称与颜色' }, { text: '删除标签', destructive: true },
    ], index => {
      if (busyRef.current) return;
      if (index === 0) startEdit(tag);
      if (index === 1) deleteTag(tag);
    });
  };

  if (loading) {
    return <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}><LoadingPlaceholder /></View>;
  }

  return (
    <DragList
      containerStyle={[styles.container, { backgroundColor: c.surfaceSecondary }]}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
      data={tags} keyExtractor={tag => tag.id}
      onReordered={reorder}
      onDragBegin={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      ListHeaderComponent={<View style={styles.intro}>
        <Text style={[styles.introTitle, { color: c.text }]}>{tags.length} 个标签</Text>
        <Text style={[styles.introHint, { color: c.textSecondary }]}>长按右侧手柄拖动，调整首页显示顺序</Text>
        <Text accessibilityLiveRegion="polite" style={[styles.status, { color: c.textSecondary }]}>{orderStatus || '松手后自动保存'}</Text>
        {!!error && <View style={{ marginTop: 12 }}>
        <Text accessibilityRole="alert" style={{ color: c.danger }}>{error}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => load()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.primary }}>重新加载</Text></TouchableOpacity>
        </View>}
      </View>}
      ListEmptyComponent={!error ? (
        <EmptyState
          icon="pricetags-outline"
          iconColor={c.textTertiary}
          title="暂无标签"
          hint="在碎碎念中输入 #标签名 自动创建"
        />
      ) : null}
      renderItem={({ item: tag, index, isActive, onDragStart, onDragEnd }) => (
        <View style={[styles.tagCard, { backgroundColor: c.cardBg, borderColor: isActive ? c.primary : c.borderLight }, isActive && styles.activeCard]}>
          {editingId === tag.id ? (
            <View>
              <View style={styles.editRow}>
                <View style={[styles.colorDot, { backgroundColor: editColor }]} />
                <TextInput style={[styles.editInput, { borderColor: c.border, color: c.text }]}
                  value={editName} onChangeText={setEditName} autoFocus accessibilityLabel="标签名称" editable={!busy} />
              </View>
              <View style={styles.colorPicker}>
                {PRESET_COLORS.map(color => (
                  <TouchableOpacity key={color} onPress={() => setEditColor(color)} disabled={busy} accessibilityRole="button" accessibilityLabel={`标签颜色 ${color}`} accessibilityState={{ selected: editColor === color }}
                    style={[styles.colorOption, { backgroundColor: color }, editColor === color && styles.colorSelected]}>
                    {editColor === color && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.editActions}>
                <TouchableOpacity disabled={busy} style={[styles.editBtn, { backgroundColor: c.borderLight }]} onPress={cancelEdit}>
                  <Text style={[styles.editBtnText, { color: c.textSecondary }]}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy || !editName.trim()} style={[styles.editBtn, { backgroundColor: c.primary, opacity: busy || !editName.trim() ? 0.5 : 1 }]} onPress={saveEdit}>
                  <Text style={[styles.editBtnText, { color: '#fff' }]}>{busy ? '保存中…' : '保存'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.tagRow}>
              <View style={[styles.colorDot, { backgroundColor: tag.color || '#3B82F6' }]} />
              <TouchableOpacity disabled={busy || dragging || !!editingId} accessibilityRole="button" accessibilityLabel={`编辑标签 ${tag.name}`} onPress={() => startEdit(tag)} style={styles.tagContent}>
                <Text numberOfLines={2} style={[styles.tagName, { color: c.text }]}>{tag.name}</Text>
                <Text style={[styles.tagCount, { color: c.textSecondary }]}>{tag.bbtalkCount || 0} 条记录</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={busy || dragging || !!editingId} accessibilityRole="button" accessibilityLabel={`标签 ${tag.name} 的更多操作`} onPress={() => showActions(tag)} style={[styles.tagAction, { opacity: busy ? 0.4 : 1 }]}>
                <Ionicons name="ellipsis-horizontal" size={20} color={c.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity disabled={busy || !!editingId || tags.length < 2}
                accessibilityRole="adjustable" accessibilityLabel={`拖动排序 ${tag.name}`}
                accessibilityHint="长按并上下拖动；也可通过调整操作改变顺序"
                accessibilityValue={{ min: 1, max: tags.length, now: index + 1 }}
                accessibilityState={{ disabled: busy || !!editingId || tags.length < 2 }}
                accessibilityActions={[{ name: 'decrement', label: '向前移动' }, { name: 'increment', label: '向后移动' }]}
                onAccessibilityAction={event => {
                  if (event.nativeEvent.actionName === 'decrement') reorder(index, index - 1);
                  if (event.nativeEvent.actionName === 'increment') reorder(index, index + 1);
                }}
                delayLongPress={220} onLongPress={onDragStart} onPressOut={onDragEnd}
                style={[styles.tagAction, { opacity: busy || !!editingId || tags.length < 2 ? 0.35 : 1 }]}>
                <Ionicons name="reorder-three-outline" size={24} color={isActive ? c.primary : c.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  intro: { paddingTop: 20, paddingBottom: 16 },
  introTitle: { fontSize: 18, fontWeight: '600' },
  introHint: { fontSize: 13, lineHeight: 20, marginTop: 6 },
  status: { fontSize: 12, marginTop: 8 },
  tagCard: {
    borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1,
  },
  activeCard: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 6 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  tagContent: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  tagName: { fontSize: 16, fontWeight: '500', lineHeight: 22 },
  tagCount: { fontSize: 12, marginTop: 3 },
  tagAction: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 44, fontSize: 16 },
  colorPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  colorOption: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  colorSelected: { borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editBtn: { flex: 1, borderRadius: 8, height: 44, justifyContent: 'center', alignItems: 'center' },
  editBtnText: { fontSize: 14, fontWeight: '500' },
});
