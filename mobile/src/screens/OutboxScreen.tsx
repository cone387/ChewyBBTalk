import { UI } from '../theme/materials';
import React, { useCallback, useState, useSyncExternalStore } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { listOutbox, onOutboxChange, retrySubmission, drainOutbox, type QueuedSubmission } from '../services/outbox';
import { getSession, isCurrentSession } from '../services/session';
import { historyIsLocked, subscribeHistoryPrivacy, recordHistoryActivity } from '../services/historyPrivacy';
import { isSyncOnline, subscribeSyncConnectivity } from '../services/syncConnectivity';
import { writeDraft } from '../services/drafts';
import { bbtalkApi } from '../services/api/bbtalkApi';
import { useTheme } from '../theme/ThemeContext';
import { xConfirm } from '../utils/crossAlert';
import { visibilityPresentation } from '../utils/visibilityPresentation';

const labels = { queued: '已保存到本机 · 等待同步', syncing: '正在同步…', failed: '需要处理', conflict: '存在编辑冲突', synced: '已保存到服务器' };
export default function OutboxScreen() {
  const navigation = useNavigation<any>();
  const { theme: { colors: c } } = useTheme();
  const locked = useSyncExternalStore(subscribeHistoryPrivacy, historyIsLocked, historyIsLocked);
  const online = useSyncExternalStore(subscribeSyncConnectivity, isSyncOnline, isSyncOnline);
  const [items, setItems] = useState<QueuedSubmission[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (locked) { setItems([]); return; }
    const session = getSession();
    const load = () => { void listOutbox(session).then(value => {
      if (active && isCurrentSession(session)) { setItems([...value].reverse()); setError(''); }
    }).catch(() => { if (active) setError('无法读取同步记录，请重试'); }).finally(() => { if (active) setLoading(false); }); };
    load(); const unsubscribe = onOutboxChange(load);
    return () => { active = false; unsubscribe(); };
  }, [locked, refresh]));
  const retry = async (entry: QueuedSubmission, version?: string) => {
    if (historyIsLocked()) return;
    const session = getSession();
    try { await retrySubmission(entry.id, version, session); await drainOutbox(session, () => isSyncOnline()); }
    catch (e: any) { if (isCurrentSession(session)) setError(e.message || '重试失败，内容仍保留在本机'); }
  };
  const edit = async (entry: QueuedSubmission) => {
    const session = getSession();
    try {
      const original: any = entry.draft || {};
      const editItem = original.editItem || (entry.recordId ? await bbtalkApi.getBBTalk(entry.recordId) : undefined);
      if (!isCurrentSession(session) || historyIsLocked()) return;
      const draftKey = `compose_draft:${session.scope}:locked:outbox_${entry.id}`;
      await writeDraft(draftKey, { ...original, version: 1, content: original.content ?? `${(entry.payload.tags || []).map(t => `#${t} `).join('')}${entry.payload.content}`,
        visibility: entry.payload.visibility, attachments: entry.payload.attachments || [], pendingMedia: entry.pendingMedia,
        location: entry.payload.context?.location || null, baseUpdatedAt: entry.expectedUpdatedAt, editItem, outboxId: entry.id }, session);
      if (isCurrentSession(session) && !historyIsLocked()) navigation.navigate('Compose', { draftKey, editItem, outboxId: entry.id });
    } catch (e: any) { if (isCurrentSession(session)) setError(e.message || '无法打开编辑器，内容仍保留'); }
  };
  if (locked) return <View style={{ flex: 1, padding: 24, backgroundColor: c.background }}><Text style={{ color: c.text }}>同步记录已锁定</Text>
    <TouchableOpacity accessibilityRole="button" onPress={() => navigation.popToTop()} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: c.primary }}>返回首页解锁</Text></TouchableOpacity></View>;
  const button = { minHeight: 48, justifyContent: 'center' as const, paddingHorizontal: 12 };
  return <ScrollView onTouchStart={recordHistoryActivity} style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
    <Text style={{ color: c.textSecondary, marginBottom: 16 }}>{online ? '联网或回到前台时，会继续同步已保存的记录。' : '当前离线，记录保存在本机，联网后继续同步。'}</Text>
    {loading && <ActivityIndicator color={c.primary} />}
    {!!error && <TouchableOpacity accessibilityRole="button" style={button} onPress={() => setRefresh(v => v + 1)}><Text style={{ color: c.danger }}>{error}</Text></TouchableOpacity>}
    {!loading && !error && !items.length && <Text style={{ color: c.textSecondary }}>没有待同步记录</Text>}
    {items.map(entry => <View key={entry.id} style={{ padding: 16, marginBottom: 12, borderRadius: UI.radius.card, backgroundColor: c.surface }}>
      <Text style={{ color: ['failed', 'conflict'].includes(entry.state) ? c.danger : c.primary, marginBottom: 8 }}>{labels[entry.state]}</Text>
      <Text style={{ color: c.text, fontSize: 16, lineHeight: 25 }}>{entry.payload.content}</Text>
      <Text style={{ color: c.textSecondary, marginTop: 8 }}>{visibilityPresentation(entry.payload.visibility ?? 'private').label} · {new Date(entry.createdAt).toLocaleString()}</Text>
      {entry.pendingMedia.map(media => <Text key={media.id} style={{ color: c.textSecondary, marginTop: 8 }}>{media.name.startsWith('voice_') ? '语音记录' : media.name} · 待上传</Text>)}
      {!!entry.error && <Text style={{ color: c.danger, marginTop: 8 }}>{entry.error}</Text>}
      {entry.conflict && <View style={{ marginTop: 12 }}>
        <Text style={{ color: c.text, fontWeight: '600' }}>服务器最新版本</Text>
        <Text style={{ color: c.text, lineHeight: 24 }}>{entry.conflict.content}</Text>
        <Text style={{ color: c.textSecondary }}>标签：{entry.conflict.tags.map(tag => tag.name).join('、') || '无'} · {visibilityPresentation(entry.conflict.visibility).label} · {entry.conflict.attachments.length} 个附件</Text>
        <TouchableOpacity accessibilityRole="button" style={button} onPress={() => xConfirm('使用本机修改更新？', '服务器版本会被这份本机修改替换；如果服务器再次变化，会再次提示冲突。', () => { void retry(entry, entry.conflict?.updatedAt); }, undefined, { confirmText: '确认更新', cancelText: '继续保留两份' })}>
          <Text style={{ color: c.primary }}>比较后，使用本机修改更新</Text>
        </TouchableOpacity>
      </View>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {['queued', 'failed'].includes(entry.state) && <TouchableOpacity accessibilityRole="button" style={button} onPress={() => { void retry(entry); }}><Text style={{ color: c.primary }}>重试同步</Text></TouchableOpacity>}
        {entry.state === 'failed' && <TouchableOpacity accessibilityRole="button" style={button} onPress={() => { void edit(entry); }}><Text style={{ color: c.primary }}>修改后重试</Text></TouchableOpacity>}
        {entry.state === 'synced' && entry.record && <TouchableOpacity accessibilityRole="button" style={button} onPress={() => navigation.navigate('RecordDetail', { item: entry.record })}><Text style={{ color: c.primary }}>查看记录</Text></TouchableOpacity>}
      </View>
    </View>)}
  </ScrollView>;
}
