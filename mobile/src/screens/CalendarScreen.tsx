import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, Modal, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { bbtalkApi } from '../services/api/bbtalkApi';
import { historyIsLocked, recordHistoryActivity } from '../services/historyPrivacy';
import { getSession, isCurrentSession } from '../services/session';
import { readCalendarCache, writeCalendarCache } from '../services/calendarCache';
import CalendarDayRecords from '../components/CalendarDayRecords';
import { onRecordsChanged } from '../services/recordChanges';

export default function CalendarScreen({ selectedDate: initialDate = null, onSelectDate }: {
  selectedDate?: string | null; onSelectDate?: (date: string) => void;
} = {}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const navigation = useNavigation<any>();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerYear, setPickerYear] = useState(String(new Date().getFullYear()));
  const [cachedMonth, setCachedMonth] = useState(false);
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  React.useEffect(() => onRecordsChanged(() => setRetry(value => value + 1)), []);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setCounts({});
    setCachedMonth(false);
    const session = getSession();
    const name = `month:${year}-${monthIndex + 1}`;
    const valid = () => active && isCurrentSession(session) && !historyIsLocked();
    void (async () => {
      const cached = await readCalendarCache<Record<string, number>>(name, session);
      if (valid() && cached) { setCounts(cached); setCachedMonth(true); }
      try {
        const data = await bbtalkApi.getDateCounts({ year, month: monthIndex + 1 });
        if (valid()) {
          const next = Object.fromEntries(data.map(day => [day.date, day.count]));
          setCounts(next); setCachedMonth(false);
          await writeCalendarCache(name, next, session).catch(() => {});
        }
      } catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [year, monthIndex, retry]));

  const days = useMemo(() => [
    ...Array.from({ length: month.getDay() }, () => null),
    ...Array.from({ length: new Date(year, monthIndex + 1, 0).getDate() }, (_, i) => i + 1),
  ], [month, year, monthIndex]);
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, index) =>
    Array.from({ length: 7 }, (_, column) => days[index * 7 + column] ?? null));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const today = new Date();
  const chooseMonth = (value: Date) => { setMonth(value); setSelectedDate(null); };
  const moveMonth = (offset: number) => chooseMonth(new Date(year, monthIndex + offset, 1));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={styles.content} onTouchStart={recordHistoryActivity}>
      <Text style={[styles.subtitle, { color: c.textSecondary }]}>按日期回看，找回那一天的心情。</Text>
      <View style={[styles.calendar, { backgroundColor: c.surface }]}>
        <View style={styles.monthRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="上个月" style={styles.monthButton} onPress={() => moveMonth(-1)}>
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="选择年月" style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => { setPickerYear(String(year)); setPickerVisible(true); }}>
            <Text style={[styles.monthTitle, { color: c.text }]}>{year}年{monthIndex + 1}月</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="下个月" style={styles.monthButton} onPress={() => moveMonth(1)}>
            <Ionicons name="chevron-forward" size={22} color={c.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.grid}>
          {['日', '一', '二', '三', '四', '五', '六'].map(day => (
            <View key={day} style={styles.cell}><Text style={{ color: c.textSecondary }}>{day}</Text></View>
          ))}
        </View>
        {weeks.map((week, weekIndex) => <View key={weekIndex} style={styles.grid}>
          {week.map((day, index) => {
            if (day === null) return <View key={`empty-${index}`} style={styles.cell} />;
            const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const count = counts[key] || 0;
            const selected = selectedDate === key;
            const isToday = today.getFullYear() === year && today.getMonth() === monthIndex && today.getDate() === day;
            return (
              <View key={key} style={styles.cell}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${key}，${count}条记录`}
                  accessibilityState={{ selected, disabled: count === 0 || (!cachedMonth && (loading || error)) }}
                  disabled={count === 0 || (!cachedMonth && (loading || error))}
                  onPress={() => {
                    if (historyIsLocked()) return;
                    setSelectedDate(key);
                    onSelectDate?.(key);
                  }}
                  style={[styles.day, selected && { backgroundColor: c.primary },
                    isToday && { borderWidth: 1, borderColor: c.primary }]}>
                  <Text style={{ color: selected ? '#fff' : count > 0 ? c.text : c.textTertiary, fontWeight: count > 0 ? '700' : '400' }}>{day}</Text>
                  <Text style={[styles.count, { color: selected ? '#fff' : c.primary }]}>{count > 0 ? `${count}条` : ' '}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>)}
        {loading ? <ActivityIndicator color={c.primary} style={styles.status} /> : error ? (
          <TouchableOpacity accessibilityRole="button" style={styles.status} onPress={() => setRetry(value => value + 1)}>
            <Text style={{ color: c.primary }}>加载失败，点击重试</Text>
          </TouchableOpacity>
        ) : <Text style={[styles.statusText, { color: c.textSecondary }]}>
          {total > 0 ? `本月记录了 ${Object.keys(counts).length} 天，共 ${total} 条碎碎念` : '这个月还没有记录，试试其他月份。'}
        </Text>}
      </View>
      {cachedMonth && <Text style={[styles.hint, { color: c.textSecondary }]}>正在显示本机日历缓存{loading ? '，更新中…' : ''}</Text>}
      <TouchableOpacity accessibilityRole="button" style={styles.todayButton}
        onPress={() => chooseMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>
        <Text style={{ color: c.primary, fontWeight: '600' }}>回到本月</Text>
      </TouchableOpacity>
      <Text style={[styles.hint, { color: c.textSecondary }]}>点击有记录的日期，查看当天的碎碎念。</Text>
      {selectedDate && <CalendarDayRecords key={selectedDate} date={selectedDate} />}
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View accessibilityViewIsModal style={{ backgroundColor: c.surface, borderRadius: 20, padding: 20, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '600' }}>选择年月</Text>
            <TextInput accessibilityLabel="年份" keyboardType="number-pad" maxLength={4} value={pickerYear} onChangeText={setPickerYear}
              style={{ color: c.text, fontSize: 20, minHeight: 48, borderBottomWidth: 1, borderBottomColor: c.border, marginVertical: 12 }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{Array.from({ length: 12 }, (_, i) => <TouchableOpacity key={i} accessibilityRole="button" accessibilityLabel={`选择${i + 1}月`}
              disabled={!/^\d{4}$/.test(pickerYear) || Number(pickerYear) < 1900 || Number(pickerYear) > 9999}
              style={{ width: '25%', minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => { chooseMonth(new Date(Number(pickerYear), i, 1)); setPickerVisible(false); }}><Text style={{ color: c.primary }}>{i + 1}月</Text></TouchableOpacity>)}</View>
            <TouchableOpacity accessibilityRole="button" onPress={() => setPickerVisible(false)} style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: c.textSecondary }}>取消</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, width: '100%', maxWidth: 600, alignSelf: 'center' },
  subtitle: { fontSize: 14, lineHeight: 22, marginBottom: 20 },
  calendar: { borderRadius: 20, padding: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthTitle: { fontSize: 18, fontWeight: '700' },
  monthButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row' },
  cell: { flex: 1, minWidth: 0, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  day: { width: '100%', minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 10, marginTop: 4 },
  status: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  statusText: { textAlign: 'center', fontSize: 13, lineHeight: 22, padding: 16 },
  todayButton: { minHeight: 48, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 24, marginTop: 12 },
  hint: { textAlign: 'center', fontSize: 13, lineHeight: 22, marginTop: 8 },
});
