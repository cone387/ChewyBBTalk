import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, type StyleProp, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { bbtalkApi } from '../services/api/bbtalkApi';
import { getSession, isCurrentSession } from '../services/session';
import { historyIsLocked } from '../services/historyPrivacy';
import { readCalendarCache, writeCalendarCache } from '../services/calendarCache';
import { useTheme } from '../theme/ThemeContext';
import type { BBTalk } from '../types';
import { onRecordsChanged } from '../services/recordChanges';
import CalendarRecordCard from './CalendarRecordCard';

interface DayPage { items: BBTalk[]; page: number; has_more: boolean; }
const emptyPage = (): DayPage => ({ items: [], page: 0, has_more: false });

export default function CalendarDayRecords({ date, header, contentContainerStyle }: {
  date: string | null;
  header?: React.ReactElement;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const { theme: { colors: c } } = useTheme();
  const navigation = useNavigation<any>();
  const [data, setData] = useState<DayPage>(emptyPage);
  const [loading, setLoading] = useState(Boolean(date));
  const [error, setError] = useState(false);
  const failedPage = useRef(1);
  const loadPage = useRef<(page: number) => void>(() => {});
  const canOpen = useRef<() => boolean>(() => false);

  // Keep loaded pages and scroll position while a record detail screen is open.
  useEffect(() => {
    let active = true;
    let busy = false;
    let refreshPending = false;
    let controller: AbortController | undefined;
    let current = emptyPage();
    const session = getSession();
    const valid = () => active && isCurrentSession(session) && !historyIsLocked();
    canOpen.current = valid;
    setData(current); setError(false); setLoading(Boolean(date));
    failedPage.current = 1;

    const load = async (page: number) => {
      if (!date || busy || !valid()) return;
      busy = true; setLoading(true); setError(false);
      controller = new AbortController();
      try {
        const result = await bbtalkApi.getBBTalks({ created_on: date, page }, { signal: controller.signal });
        if (!valid()) return;
        const merged = page === 1 ? result.items : [...current.items, ...result.items];
        current = { items: [...new Map(merged.map(item => [item.id, item])).values()], page, has_more: result.has_more };
        setData(current);
        await writeCalendarCache(`day:${date}`, current, session).catch(() => {});
      } catch {
        if (valid()) { failedPage.current = page; setError(true); }
      } finally {
        busy = false;
        if (valid()) {
          setLoading(false);
          if (refreshPending) { refreshPending = false; void load(1); }
        }
      }
    };
    loadPage.current = page => { void load(page); };
    const unsubscribe = onRecordsChanged(() => {
      if (busy) refreshPending = true;
      else void load(1);
    });
    if (date) void (async () => {
      const cached = await readCalendarCache<DayPage>(`day:${date}`, session);
      if (!valid()) return;
      if (cached && Array.isArray(cached.items)) { current = cached; setData(cached); }
      await load(1);
    })();
    return () => { active = false; controller?.abort(); unsubscribe(); };
  }, [date]);

  const openRecord = useCallback((item: BBTalk) => {
    if (canOpen.current()) navigation.navigate('RecordDetail', { item });
  }, [navigation]);
  const renderItem = useCallback(({ item }: { item: BBTalk }) => <CalendarRecordCard item={item} onOpen={openRecord} />, [openRecord]);

  return <FlatList
    style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={contentContainerStyle}
    data={date ? data.items : []} keyExtractor={item => item.id} renderItem={renderItem}
    initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
    ListHeaderComponent={<>{header}{date && <View style={{ marginTop: 20 }}>
      <Text style={{ color: c.text, fontSize: 18, fontWeight: '600', marginBottom: 12 }}>{date} 的记录</Text>
      {error && <Text style={{ color: c.textSecondary, marginBottom: 8 }}>{data.items.length ? '暂时无法更新，正在显示本机缓存' : '暂时无法加载当天记录'}</Text>}
    </View>}</>}
    ListFooterComponent={date ? <>
      {loading && <ActivityIndicator color={c.primary} />}
      {!loading && !error && !data.items.length && <Text style={{ color: c.textSecondary }}>当天还没有记录</Text>}
      {!loading && (error || data.has_more) && <TouchableOpacity accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
        onPress={() => loadPage.current(error ? failedPage.current : data.page + 1)}>
        <Text style={{ color: c.primary }}>{error ? '重试加载记录' : '加载更多当天记录'}</Text>
      </TouchableOpacity>}
    </> : null}
  />;
}
