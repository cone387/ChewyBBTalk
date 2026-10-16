import { useGlassPreferences } from '../theme/GlassPreferences';
import GlassSurface from '../components/GlassSurface';
import { UI } from '../theme/materials';
import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, KeyboardAvoidingView, Platform, ScrollView, Keyboard,
} from 'react-native';
import DragList from 'react-native-draglist';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { tagApi } from '../services/api/tagApi';
import { useAppDispatch } from '../store/hooks';
import { setTags as setStoreTags } from '../store/slices/tagSlice';
import EmptyState from '../components/EmptyState';
import LoadingPlaceholder from '../components/LoadingPlaceholder';
import type { Tag } from '../types';
import { getSession, isCurrentSession } from '../services/session';
import { historyIsLocked, subscribeHistoryPrivacy, recordHistoryActivity } from '../services/historyPrivacy';

const PRESET_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B',
  '#10B981', '#06B6D4', '#6366F1', '#F97316', '#84CC16',
];

export default function TagManagementScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const { reduceMotion } = useGlassPreferences();
  const dispatch = useAppDispatch();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editError, setEditError] = useState('');
  const [deleteStage, setDeleteStage] = useState<'choose' | 'confirm' | null>(null);
  const locked = useSyncExternalStore(subscribeHistoryPrivacy, historyIsLocked, historyIsLocked);
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
  useEffect(() => {
    if (locked) { setEditingId(null); setEditName(''); setEditColor(''); setDeleteStage(null); Keyboard.dismiss(); }
  }, [locked]);

  const startEdit = (tag: Tag) => { if (busyRef.current || dragging || historyIsLocked()) return; recordHistoryActivity(); setEditError(''); setDeleteStage(null); setEditingId(tag.id); setEditName(tag.name); setEditColor(tag.color); };
  const cancelEdit = () => { setEditingId(null); setDeleteStage(null); Keyboard.dismiss(); };
  const mutate = async (action: () => Promise<void>) => {
    if (busyRef.current || historyIsLocked() || !isCurrentSession(session)) return;
    recordHistoryActivity();
    setEditError('');
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
    } catch (e: any) { if (isCurrentSession(session) && !historyIsLocked()) setEditError(e.message || '保存失败，请重试'); }
  });

  const editingTag = tags.find(tag => tag.id === editingId);
  const deleteTag = (cascade: boolean) => mutate(async () => {
    if (!editingId) return;
    try {
      await tagApi.deleteTag(editingId, cascade);
      if (!isCurrentSession(session)) return;
      cancelEdit(); await load(true);
    } catch (e: any) { if (isCurrentSession(session) && !historyIsLocked()) setEditError(e.message || '删除失败，请重试'); }
  });

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
        if (!historyIsLocked()) setError(e.message || '顺序没有保存，请重试');
      }
    });
  };

  if (locked) return <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]} />;

  if (loading) {
    return <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}><LoadingPlaceholder /></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]} onTouchStart={recordHistoryActivity}>
    <DragList
      containerStyle={[styles.container, { backgroundColor: c.surfaceSecondary }]}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
      data={tags} keyExtractor={tag => tag.id}
      onReordered={reorder}
      onDragBegin={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      ListHeaderComponent={orderStatus || error ? <View style={{ paddingBottom: 12 }}>
        {!!orderStatus && <Text accessibilityLiveRegion="polite" style={[styles.status, { color: c.textSecondary }]}>{orderStatus}</Text>}
        {!!error && <View style={{ marginTop: 12 }}>
        <Text accessibilityRole="alert" style={{ color: c.danger }}>{error}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => load()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.primary }}>重新加载</Text></TouchableOpacity>
        </View>}
      </View> : null}
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

            <View style={styles.tagRow}>
              <View style={[styles.colorDot, { backgroundColor: tag.color || '#3B82F6' }]} />
              <TouchableOpacity disabled={busy || dragging || !!editingId} accessibilityRole="button" accessibilityLabel={`编辑标签 ${tag.name}`} onPress={() => startEdit(tag)} style={styles.tagContent}>
                <Text numberOfLines={2} style={[styles.tagName, { color: c.text }]}>{tag.name}</Text>
                <Text style={[styles.tagCount, { color: c.textSecondary }]}>{tag.bbtalkCount || 0} 条记录</Text>
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
                <Ionicons name="reorder-three-outline" size={24} color={isActive ? c.primary : c.textTertiary} />
              </TouchableOpacity>
            </View>

        </View>
      )}
    />

    {!!editingTag && <Modal transparent animationType={reduceMotion ? "none" : "fade"} visible onRequestClose={() => { if (!busyRef.current) cancelEdit(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalBackdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]} onTouchStart={recordHistoryActivity}>
        <GlassSurface theme={theme} radius={28} elevated style={styles.modalCard} accessibilityViewIsModal>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeading}>

              <Text style={[styles.introTitle, { color: c.text }]}>{deleteStage ? '删除标签' : '编辑标签'}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="关闭标签编辑" disabled={busy} onPress={cancelEdit} style={styles.tagAction}>
                <Ionicons name="close" size={22} color={c.textSecondary} />
              </TouchableOpacity>
            </View>
            {!!editError && <Text accessibilityRole="alert" style={{ color: c.danger, marginBottom: 12 }}>{editError}</Text>}
            {!deleteStage ? <>

            <View>
              <View style={styles.editRow}>
                <View style={[styles.colorDot, { backgroundColor: editColor }]} />
                <TextInput style={[styles.editInput, { borderColor: c.border, color: c.text }]}
                  value={editName} onChangeText={value => { recordHistoryActivity(); setEditName(value); }} autoFocus accessibilityLabel="标签名称" editable={!busy} />
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

              <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => { Keyboard.dismiss(); setDeleteStage('choose'); }} style={styles.deleteButton}>
                <Text style={{ color: c.danger }}>删除标签</Text>
              </TouchableOpacity>
            </> : <View>
              <Text style={[styles.deleteMessage, { color: c.text }]}>{deleteStage === 'confirm'
                ? `将永久删除「${editingTag.name}」及其关联的 ${editingTag.bbtalkCount} 条记录，不可恢复！`
                : `删除「${editingTag.name}」？（关联 ${editingTag.bbtalkCount || 0} 条碎碎念）`}</Text>
              {deleteStage === 'choose' ? <>
                <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => deleteTag(false)} style={styles.deleteButton}><Text style={{ color: c.danger }}>仅删除标签，保留记录</Text></TouchableOpacity>
                {(editingTag.bbtalkCount ?? 0) > 0 && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => setDeleteStage('confirm')} style={styles.deleteButton}><Text style={{ color: c.danger }}>同时删除碎碎念</Text></TouchableOpacity>}
              </> : <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => deleteTag(true)} style={styles.deleteButton}><Text style={{ color: c.danger }}>确认删除</Text></TouchableOpacity>}
              <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => setDeleteStage(null)} style={styles.deleteButton}><Text style={{ color: c.textSecondary }}>取消</Text></TouchableOpacity>
            </View>}
          </ScrollView>
        </GlassSurface>
      </KeyboardAvoidingView>
    </Modal>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  modalBackdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: { width: '100%', maxWidth: 480, maxHeight: '100%', alignSelf: 'center', borderRadius: 16, overflow: 'hidden' },
  modalContent: { padding: 20 },
  modalHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  deleteButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  deleteMessage: { fontSize: 15, lineHeight: 24 },
  introTitle: { fontSize: 18, fontWeight: '600' },
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
  editInput: { flex: 1, borderWidth: 1, borderRadius: UI.radius.field, paddingHorizontal: 10, minHeight: UI.touch, fontSize: 16 },
  colorPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  colorOption: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  colorSelected: { borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editBtn: { flex: 1, borderRadius: UI.radius.pill, minHeight: UI.touch, justifyContent: 'center', alignItems: 'center' },
  editBtnText: { fontSize: 14, fontWeight: '500' },
});
