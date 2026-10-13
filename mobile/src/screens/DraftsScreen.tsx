import React, { useCallback, useState, useSyncExternalStore } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { listDrafts, readDraft, type DraftEntry } from '../services/drafts';
import { getSession, isCurrentSession } from '../services/session';
import { historyIsLocked, subscribeHistoryPrivacy, recordHistoryActivity } from '../services/historyPrivacy';
import { bbtalkApi } from '../services/api/bbtalkApi';
import { useTheme } from '../theme/ThemeContext';

export default function DraftsScreen() {
  const navigation = useNavigation<any>();
  const { theme: { colors: c } } = useTheme();
  const locked = useSyncExternalStore(subscribeHistoryPrivacy, historyIsLocked, historyIsLocked);
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [opening, setOpening] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (locked) { setEntries([]); return; }
    setLoading(true); setError('');
    const session = getSession();
    void listDrafts(session).then(value => { if (active && isCurrentSession(session)) setEntries(value); })
      .catch(() => { if (active) setError('无法读取本机草稿，请重试'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locked, retry]));
  const open = async (entry: DraftEntry) => {
    if (opening || historyIsLocked()) return;
    const session = getSession(); setOpening(true); setError('');
    try {
      let editItem;
      const raw = await readDraft(entry.key);
      let saved: any;
      try { saved = raw ? JSON.parse(raw) : null; } catch { saved = null; }
      if (entry.recordId) {
        editItem = saved?.editItem || await bbtalkApi.getBBTalk(entry.recordId);
      }
      editItem ||= saved?.editItem;
      if (isCurrentSession(session) && !historyIsLocked()) navigation.navigate('Compose', { draftKey: entry.key, editItem, outboxId: saved?.outboxId });
    } catch { setError('暂时无法打开这条记录，草稿仍保留在本机，请联网后重试'); }
    finally { setOpening(false); }
  };
  if (locked) return <View style={{ flex: 1, padding: 24, backgroundColor: c.background }}>
    <Text style={{ color: c.text }}>未完成记录已锁定</Text>
    <TouchableOpacity onPress={() => navigation.popToTop()} style={{ minHeight: 48, justifyContent: 'center' }} accessibilityRole="button"><Text style={{ color: c.primary }}>返回首页解锁</Text></TouchableOpacity>
  </View>;
  return <View style={{ flex: 1, backgroundColor: c.background }} onTouchStart={recordHistoryActivity}>
    {loading && <ActivityIndicator color={c.primary} />}
    {!!error && <TouchableOpacity accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={{ padding: 16, minHeight: 48 }}><Text style={{ color: c.danger }}>{error}</Text></TouchableOpacity>}
    <FlatList data={entries} keyExtractor={entry => entry.key} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      ListEmptyComponent={!loading && !error ? <Text style={{ color: c.textSecondary }}>没有未完成记录</Text> : null}
      renderItem={({ item }) => <TouchableOpacity disabled={opening} accessibilityRole="button" onPress={() => { void open(item); }}
        style={{ padding: 16, marginBottom: 12, borderRadius: 16, backgroundColor: c.surface }}>
        <Text numberOfLines={3} style={{ color: c.text, fontSize: 16, lineHeight: 24 }}>{item.preview}</Text>
        <Text style={{ color: c.textSecondary, marginTop: 8 }}>{item.recordId ? '编辑草稿' : '新记录'} · 已保存到本机{item.pendingCount ? ` · ${item.pendingCount} 个附件待上传` : ''}</Text>
        <Text style={{ color: c.primary, marginTop: 12 }}>继续编辑</Text>
      </TouchableOpacity>} />
  </View>;
}
