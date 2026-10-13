import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { bbtalkApi } from '../services/api/bbtalkApi';
import { getSession, isCurrentSession } from '../services/session';
import { historyIsLocked } from '../services/historyPrivacy';
import { readCalendarCache, writeCalendarCache } from '../services/calendarCache';
import { useTheme } from '../theme/ThemeContext';
import type { BBTalk } from '../types';
import { onRecordsChanged } from '../services/recordChanges';

interface DayPage { items: BBTalk[]; page: number; has_more: boolean; }
export default function CalendarDayRecords({ date }: { date: string }) {
  const { theme: { colors: c } } = useTheme();
  const navigation = useNavigation<any>();
  const [data, setData] = useState<DayPage>({ items: [], page: 0, has_more: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const failedPage = useRef(1);
  const active = useRef(true);
  const busy = useRef(false);
  const refreshPending = useRef(false);
  const refresh = useRef(() => {});
  const session = useRef(getSession()).current;
  const valid = () => active.current && isCurrentSession(session) && !historyIsLocked();
  const load = async (page: number, previous: DayPage = data) => {
    if (busy.current || !valid()) return;
    busy.current = true; setLoading(true); setError(false);
    try {
      const result = await bbtalkApi.getBBTalks({ created_on: date, page });
      if (!valid()) return;
      const merged = page === 1 ? result.items : [...previous.items, ...result.items];
      const next = { items: [...new Map(merged.map(item => [item.id, item])).values()], page, has_more: result.has_more };
      setData(next);
      await writeCalendarCache(`day:${date}`, next, session).catch(() => {});
    } catch { if (valid()) { failedPage.current = page; setError(true); } }
    finally {
      busy.current = false;
      if (active.current) setLoading(false);
      if (refreshPending.current && valid()) { refreshPending.current = false; void load(1); }
    }
  };
  refresh.current = () => { if (busy.current) refreshPending.current = true; else void load(1); };
  useEffect(() => onRecordsChanged(() => refresh.current()), []);
  useEffect(() => {
    active.current = true;
    void (async () => {
      const cached = await readCalendarCache<DayPage>(`day:${date}`, session);
      if (!valid()) return;
      if (cached && Array.isArray(cached.items)) setData(cached);
      await load(1);
    })();
    return () => { active.current = false; };
  }, [date]);
  return <View style={{ marginTop: 20 }}>
    <Text style={{ color: c.text, fontSize: 18, fontWeight: '600', marginBottom: 12 }}>{date} 的记录</Text>
    {error && <Text style={{ color: c.textSecondary, marginBottom: 8 }}>{data.items.length ? '暂时无法更新，正在显示本机缓存' : '暂时无法加载当天记录'}</Text>}
    {data.items.map(item => <TouchableOpacity key={item.id} accessibilityRole="button"
      onPress={() => { if (valid()) navigation.navigate('RecordDetail', { item }); }}
      style={{ padding: 16, marginBottom: 12, borderRadius: 16, backgroundColor: c.surface }}>
      <Text numberOfLines={5} style={{ color: c.text, fontSize: 16, lineHeight: 25 }}>{item.content}</Text>
      <Text style={{ color: c.textSecondary, marginTop: 8 }}>{item.attachments.length ? `${item.attachments.length} 个附件 · ` : ''}点击阅读全文</Text>
    </TouchableOpacity>)}
    {loading && <ActivityIndicator color={c.primary} />}
    {!loading && !error && !data.items.length && <Text style={{ color: c.textSecondary }}>当天还没有记录</Text>}
    {!loading && (error || data.has_more) && <TouchableOpacity accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
      onPress={() => { void load(error ? failedPage.current : data.page + 1); }}>
      <Text style={{ color: c.primary }}>{error ? '重试加载记录' : '加载更多当天记录'}</Text>
    </TouchableOpacity>}
  </View>;
}
