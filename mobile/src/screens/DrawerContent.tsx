import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, LayoutAnimation, UIManager, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { loadTags } from '../store/slices/tagSlice';
import { getCurrentUser } from '../services/auth';
import { bbtalkApi } from '../services/api/bbtalkApi';
import { useTheme } from '../theme/ThemeContext';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

interface Props {
  selectedTag: string | null;
  onSelectTag: (tagId: string | null) => void;
  onClose: () => void;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function DrawerContent({ selectedTag, onSelectTag, onClose }: Props) {
  const dispatch = useAppDispatch();
  const { tags } = useAppSelector(s => s.tag);
  const { totalCount } = useAppSelector(s => s.bbtalk);
  const currentUser = getCurrentUser();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const c = theme.colors;
  const [tagsExpanded, setTagsExpanded] = useState(true);
  const [calendarExpanded, setCalendarExpanded] = useState(true);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [dateCounts, setDateCounts] = useState<Record<string, number>>({});

  useEffect(() => { if (tags.length === 0) dispatch(loadTags()); }, []);

  const loadDateCounts = useCallback(async (year: number, month: number) => {
    try {
      const data = await bbtalkApi.getDateCounts({ year, month: month + 1 });
      const map: Record<string, number> = {};
      data.forEach(item => { map[item.date] = item.count; });
      setDateCounts(map);
    } catch {}
  }, []);

  useEffect(() => { loadDateCounts(calYear, calMonth); }, [calYear, calMonth]);

  const select = (id: string | null) => { onSelectTag(id); onClose(); };
  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTagsExpanded(!tagsExpanded);
  };
  const toggleCalendar = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCalendarExpanded(!calendarExpanded);
  };

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); }
    else setCalMonth(calMonth + 1);
  };

  // Build calendar grid
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfWeek(calYear, calMonth);
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  const today = new Date();
  const isToday = (day: number) =>
    calYear === today.getFullYear() && calMonth === today.getMonth() && day === today.getDate();

  const getDateKey = (day: number) => {
    const m = String(calMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${calYear}-${m}-${d}`;
  };

  const getIntensity = (count: number) => {
    if (count === 0) return 'transparent';
    if (count <= 1) return c.primary + '30';
    if (count <= 3) return c.primary + '60';
    if (count <= 5) return c.primary + '90';
    return c.primary + 'CC';
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, backgroundColor: c.surface }]}>
      {/* 日历区 */}
      <TouchableOpacity style={styles.sectionHeader} onPress={toggleCalendar} activeOpacity={0.7}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="calendar-outline" size={16} color={c.textSecondary} />
          <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>日历</Text>
        </View>
        <Ionicons name={calendarExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={c.textTertiary} />
      </TouchableOpacity>

      {calendarExpanded && (
        <View style={styles.calendarWrap}>
          {/* Month nav */}
          <View style={styles.calNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
              <Ionicons name="chevron-back" size={18} color={c.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.calNavTitle, { color: c.text }]}>{calYear}年{calMonth + 1}月</Text>
            <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
              <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Weekday headers */}
          <View style={styles.calRow}>
            {WEEKDAYS.map(w => (
              <View key={w} style={styles.calCell}>
                <Text style={[styles.calWeekday, { color: c.textTertiary }]}>{w}</Text>
              </View>
            ))}
          </View>

          {/* Days grid */}
          <View style={styles.calGrid}>
            {calendarDays.map((day, i) => {
              if (day === null) return <View key={`e${i}`} style={styles.calCell} />;
              const key = getDateKey(day);
              const count = dateCounts[key] || 0;
              return (
                <View key={key} style={styles.calCell}>
                  <View style={[
                    styles.calDay,
                    count > 0 && { backgroundColor: getIntensity(count) },
                    isToday(day) && { borderWidth: 1.5, borderColor: c.primary },
                  ]}>
                    <Text style={[
                      styles.calDayText,
                      { color: count > 3 ? '#fff' : c.text },
                      isToday(day) && { fontWeight: '700' },
                    ]}>{day}</Text>
                  </View>
                  {count > 0 && <Text style={[styles.calCount, { color: c.primary }]}>{count}</Text>}
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* 标签区 */}
      <TouchableOpacity style={styles.sectionHeader} onPress={toggleExpand} activeOpacity={0.7}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="pricetags-outline" size={16} color={c.textSecondary} />
          <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>标签</Text>
        </View>
        <Ionicons name={tagsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={c.textTertiary} />
      </TouchableOpacity>

      <ScrollView style={styles.tagScroll} showsVerticalScrollIndicator={false}>
        {tagsExpanded && (
          <>
            <TouchableOpacity style={[styles.item, !selectedTag && { backgroundColor: c.borderLight }]} onPress={() => select(null)}>
              <Ionicons name="pricetag-outline" size={16} color={c.textTertiary} style={{ marginRight: 8 }} />
              <Text style={[styles.itemText, { color: c.text }, !selectedTag && { fontWeight: '600' }]}>全部</Text>
              {totalCount > 0 && <Text style={[styles.itemCount, { color: c.textTertiary }]}>{totalCount}</Text>}
            </TouchableOpacity>

            {tags.map(tag => (
              <TouchableOpacity key={tag.id} style={[styles.item, selectedTag === tag.id && { backgroundColor: c.borderLight }]} onPress={() => select(tag.id)}>
                <View style={[styles.tagDot, { backgroundColor: tag.color || '#3B82F6' }]} />
                <Text style={[styles.itemText, { color: c.text }, selectedTag === tag.id && { fontWeight: '600' }]}>{tag.name}</Text>
                {(tag.bbtalkCount ?? 0) > 0 && <Text style={[styles.itemCount, { color: c.textTertiary }]}>{tag.bbtalkCount}</Text>}
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      {/* 底部用户 + 设置 */}
      {currentUser && (
        <View style={[styles.userSection, { paddingBottom: insets.bottom + 12, borderTopColor: c.borderLight }]}>
          <View style={styles.userRow}>
            <View style={[styles.avatar, { backgroundColor: c.avatarBg }]}>
              <Text style={styles.avatarText}>{(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: c.text }]}>{currentUser.display_name || currentUser.username}</Text>
              <Text style={[styles.userSub, { color: c.textSecondary }]}>@{currentUser.username}</Text>
            </View>
            <TouchableOpacity onPress={() => { onClose(); setTimeout(() => navigation.navigate('Settings'), 100); }} style={{ padding: 6 }}>
              <Ionicons name="settings-outline" size={20} color={c.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, paddingTop: 6,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600' },
  // Calendar
  calendarWrap: { paddingHorizontal: 12, marginBottom: 8 },
  calNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calNavBtn: { padding: 4 },
  calNavTitle: { fontSize: 14, fontWeight: '600' },
  calRow: { flexDirection: 'row' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.28%', alignItems: 'center', marginBottom: 4 },
  calWeekday: { fontSize: 11, fontWeight: '500' },
  calDay: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  calDayText: { fontSize: 12 },
  calCount: { fontSize: 8, fontWeight: '700', marginTop: -2 },
  // Tags
  tagScroll: { flex: 1, paddingHorizontal: 12 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, marginBottom: 2 },
  tagDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  itemText: { flex: 1, fontSize: 14 },
  itemCount: { fontSize: 12 },
  // User
  userSection: { padding: 16, borderTopWidth: 0.5 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  userName: { fontSize: 14, fontWeight: '600' },
  userSub: { fontSize: 12 },
});
