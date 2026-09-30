import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ScrollView, LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { xAlert, xConfirm, xActionSheet } from '../utils/crossAlert';
import { tagApi } from '../services/api/tagApi';
import { useAppDispatch } from '../store/hooks';
import { loadTags } from '../store/slices/tagSlice';
import EmptyState from '../components/EmptyState';
import LoadingPlaceholder from '../components/LoadingPlaceholder';
import type { Tag } from '../types';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

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

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try { setTags(await tagApi.getTags()); }
    catch (e: any) { setError(e.message || '标签加载失败，请重试'); }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const startEdit = (tag: Tag) => { setEditingId(tag.id); setEditName(tag.name); setEditColor(tag.color); };
  const cancelEdit = () => { setEditingId(null); };
  const mutate = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await action(); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const saveEdit = () => mutate(async () => {
    if (!editingId || !editName.trim()) return;
    try {
      await tagApi.updateTag(editingId, { name: editName.trim(), color: editColor });
      cancelEdit(); await load(true); dispatch(loadTags());
    } catch (e: any) { xAlert('保存失败', e.message); }
  });

  const deleteTag = (tag: Tag) => {
    const options: { text: string; action: () => void; destructive?: boolean }[] = [
      { text: '仅删除标签，保留记录', action: () => mutate(async () => {
        try { await tagApi.deleteTag(tag.id, false); await load(true); dispatch(loadTags()); }
        catch (e: any) { xAlert('删除失败', e.message); }
      })},
    ];
    if (tag.bbtalkCount && tag.bbtalkCount > 0) {
      options.push({ text: '同时删除碎碎念', destructive: true, action: () => {
        xConfirm('删除标签和记录', `将永久删除「${tag.name}」及其关联的 ${tag.bbtalkCount} 条记录，不可恢复！`, () => mutate(async () => {
          try { await tagApi.deleteTag(tag.id, true); await load(true); dispatch(loadTags()); }
          catch (e: any) { xAlert('删除失败', e.message); }
        }), undefined, { confirmText: '确认删除', destructive: true });
      }});
    }
    xActionSheet(`删除「${tag.name}」？（关联 ${tag.bbtalkCount || 0} 条碎碎念）`, options, (index) => {
      options[index].action();
    });
  };

  const moveTag = (index: number, direction: 'up' | 'down') => mutate(async () => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= tags.length) return;
    const newTags = [...tags];
    [newTags[index], newTags[swapIdx]] = [newTags[swapIdx], newTags[index]];
    setTags(newTags);
    try {
      await tagApi.reorder(newTags.map((t, i) => ({ uid: t.id, sort_order: i })));
      dispatch(loadTags());
    } catch (e: any) { setTags(tags); xAlert('排序失败', e.message || '顺序没有保存，请重试'); }
  });

  if (loading) {
    return <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}><LoadingPlaceholder /></View>;
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.surfaceSecondary }]}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}
      keyboardShouldPersistTaps="handled">

      {!!error && <View style={{ marginBottom: 16 }}>
        <Text accessibilityRole="alert" style={{ color: c.danger }}>{error}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => load()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.primary }}>重新加载</Text></TouchableOpacity>
      </View>}
      {!error && tags.length === 0 && (
        <EmptyState
          icon="pricetags-outline"
          iconColor={c.textTertiary}
          title="暂无标签"
          hint="在碎碎念中输入 #标签名 自动创建"
        />
      )}

      {tags.map((tag, index) => (
        <View key={tag.id} style={[styles.tagCard, { backgroundColor: c.cardBg }]}>
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
              <View style={styles.sortBtns}>
                <TouchableOpacity onPress={() => moveTag(index, 'up')}
                  disabled={busy || index === 0} accessibilityRole="button" accessibilityLabel={`上移标签 ${tag.name}`}
                  style={[styles.sortBtn, { opacity: index === 0 || busy ? 0.3 : 1 }]}>
                  <Ionicons name="chevron-up" size={18} color={c.textTertiary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => moveTag(index, 'down')}
                  disabled={busy || index === tags.length - 1} accessibilityRole="button" accessibilityLabel={`下移标签 ${tag.name}`}
                  style={[styles.sortBtn, { opacity: index === tags.length - 1 || busy ? 0.3 : 1 }]}>
                  <Ionicons name="chevron-down" size={18} color={c.textTertiary} />
                </TouchableOpacity>
              </View>
              <View style={[styles.colorDot, { backgroundColor: tag.color || '#3B82F6' }]} />
              <Text style={[styles.tagName, { color: c.text }]}>{tag.name}</Text>
              <Text style={[styles.tagCount, { color: c.textTertiary }]}>{tag.bbtalkCount || 0}</Text>
              <TouchableOpacity disabled={busy} accessibilityRole="button" accessibilityLabel={`编辑标签 ${tag.name}`} onPress={() => startEdit(tag)} style={styles.tagAction}>
                <Ionicons name="create-outline" size={18} color={c.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity disabled={busy} accessibilityRole="button" accessibilityLabel={`删除标签 ${tag.name}`} onPress={() => deleteTag(tag)} style={styles.tagAction}>
                <Ionicons name="trash-outline" size={18} color={c.danger} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tagCard: {
    borderRadius: 16, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortBtns: { alignItems: 'center', marginRight: 2 },
  sortBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  tagName: { flex: 1, fontSize: 15, fontWeight: '500' },
  tagCount: { fontSize: 13, marginRight: 4 },
  tagAction: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 44, fontSize: 16 },
  colorPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  colorOption: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  colorSelected: { borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editBtn: { flex: 1, borderRadius: 8, height: 44, justifyContent: 'center', alignItems: 'center' },
  editBtnText: { fontSize: 14, fontWeight: '500' },
});
