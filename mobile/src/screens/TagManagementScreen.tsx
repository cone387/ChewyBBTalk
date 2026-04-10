import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, TextInput,
  ScrollView, ActivityIndicator, LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { tagApi } from '../services/api/tagApi';
import { useAppDispatch } from '../store/hooks';
import { loadTags } from '../store/slices/tagSlice';
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

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setTags(await tagApi.getTags()); } catch {}
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const startEdit = (tag: Tag) => { setEditingId(tag.id); setEditName(tag.name); setEditColor(tag.color); };
  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      await tagApi.updateTag(editingId, { name: editName.trim(), color: editColor });
      cancelEdit(); await load(true); dispatch(loadTags());
    } catch (e: any) { Alert.alert('保存失败', e.message); }
  };

  const deleteTag = (tag: Tag) => {
    Alert.alert(
      '删除标签',
      `确定删除「${tag.name}」？（关联 ${tag.bbtalkCount || 0} 条碎碎念）`,
      [
        { text: '取消', style: 'cancel' },
        { text: '仅删除标签', onPress: async () => {
          try { await tagApi.deleteTag(tag.id, false); await load(true); dispatch(loadTags()); }
          catch (e: any) { Alert.alert('删除失败', e.message); }
        }},
        ...(tag.bbtalkCount && tag.bbtalkCount > 0 ? [{
          text: '同时删除碎碎念', style: 'destructive' as const, onPress: async () => {
            Alert.alert('二次确认', `将永久删除「${tag.name}」及其关联的碎碎念，不可恢复！`, [
              { text: '取消', style: 'cancel' },
              { text: '确认删除', style: 'destructive', onPress: async () => {
                try { await tagApi.deleteTag(tag.id, true); await load(true); dispatch(loadTags()); }
                catch (e: any) { Alert.alert('删除失败', e.message); }
              }},
            ]);
          },
        }] : []),
      ]
    );
  };

  const moveTag = async (index: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= tags.length) return;
    const newTags = [...tags];
    [newTags[index], newTags[swapIdx]] = [newTags[swapIdx], newTags[index]];
    setTags(newTags);
    try {
      await tagApi.reorder(newTags.map((t, i) => ({ uid: t.id, sort_order: i })));
      dispatch(loadTags());
    } catch {}
  };

  if (loading) {
    return <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}><View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View></View>;
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.surfaceSecondary }]}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}
      keyboardShouldPersistTaps="handled">

      {tags.length === 0 && (
        <View style={[styles.emptyCard, { backgroundColor: c.cardBg }]}>
          <Ionicons name="pricetags-outline" size={40} color={c.textTertiary} />
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>暂无标签</Text>
          <Text style={[styles.emptyHint, { color: c.textTertiary }]}>在碎碎念中输入 #标签名 自动创建</Text>
        </View>
      )}

      {tags.map((tag, index) => (
        <View key={tag.id} style={[styles.tagCard, { backgroundColor: c.cardBg }]}>
          {editingId === tag.id ? (
            <View>
              <View style={styles.editRow}>
                <View style={[styles.colorDot, { backgroundColor: editColor }]} />
                <TextInput style={[styles.editInput, { borderColor: c.border, color: c.text }]}
                  value={editName} onChangeText={setEditName} autoFocus />
              </View>
              <View style={styles.colorPicker}>
                {PRESET_COLORS.map(color => (
                  <TouchableOpacity key={color} onPress={() => setEditColor(color)}
                    style={[styles.colorOption, { backgroundColor: color }, editColor === color && styles.colorSelected]}>
                    {editColor === color && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.editActions}>
                <TouchableOpacity style={[styles.editBtn, { backgroundColor: c.borderLight }]} onPress={cancelEdit}>
                  <Text style={[styles.editBtnText, { color: c.textSecondary }]}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.editBtn, { backgroundColor: c.primary }]} onPress={saveEdit}>
                  <Text style={[styles.editBtnText, { color: '#fff' }]}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.tagRow}>
              <View style={styles.sortBtns}>
                <TouchableOpacity onPress={() => moveTag(index, 'up')}
                  style={[styles.sortBtn, { opacity: index === 0 ? 0.15 : 1 }]} hitSlop={{ top: 8, bottom: 4, left: 8, right: 8 }}>
                  <Ionicons name="chevron-up" size={18} color={c.textTertiary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => moveTag(index, 'down')}
                  style={[styles.sortBtn, { opacity: index === tags.length - 1 ? 0.15 : 1 }]} hitSlop={{ top: 4, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="chevron-down" size={18} color={c.textTertiary} />
                </TouchableOpacity>
              </View>
              <View style={[styles.colorDot, { backgroundColor: tag.color || '#3B82F6' }]} />
              <Text style={[styles.tagName, { color: c.text }]}>{tag.name}</Text>
              <Text style={[styles.tagCount, { color: c.textTertiary }]}>{tag.bbtalkCount || 0}</Text>
              <TouchableOpacity onPress={() => startEdit(tag)} style={styles.tagAction} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Ionicons name="create-outline" size={18} color={c.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteTag(tag)} style={styles.tagAction} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyCard: { borderRadius: 16, padding: 40, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptyHint: { fontSize: 13 },
  tagCard: {
    borderRadius: 12, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortBtns: { alignItems: 'center', marginRight: 2 },
  sortBtn: { padding: 1 },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  tagName: { flex: 1, fontSize: 15, fontWeight: '500' },
  tagCount: { fontSize: 13, marginRight: 4 },
  tagAction: { padding: 4 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 38, fontSize: 15 },
  colorPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  colorOption: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  colorSelected: { borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editBtn: { flex: 1, borderRadius: 8, height: 36, justifyContent: 'center', alignItems: 'center' },
  editBtnText: { fontSize: 14, fontWeight: '500' },
});
