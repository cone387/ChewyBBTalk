import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Tag } from '../types';
import type { Theme } from '../theme/ThemeContext';
import GlassSurface from './GlassSurface';

export interface TagTabsProps {
  tags: Tag[];
  selectedTag: string | null;
  selectedDate: string | null;
  onSelectTag: (tagId: string | null) => void;
  onResetAnim: () => void;
  onManage?: () => void;
  scrollRef: any;
  theme: Theme;
}

function TagTabs({
  tags,
  selectedTag,
  selectedDate,
  onSelectTag,
  onResetAnim,
  onManage,
  scrollRef,
  theme,
}: TagTabsProps) {
  const c = theme.colors;

  return (
    <GlassSurface theme={theme} radius={26} style={styles.tagTabsWrap}>
      <ScrollView
        style={styles.scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        ref={scrollRef as React.RefObject<ScrollView>}
        contentContainerStyle={styles.tagTabsContent}
      >
        <TouchableOpacity
          style={[
            styles.tagTab,
            !selectedTag && !selectedDate && { backgroundColor: c.primaryLight },
          ]}
          onPress={() => { onSelectTag(null); onResetAnim(); }}
          accessibilityRole="tab"
          accessibilityLabel="全部"
          accessibilityState={{ selected: !selectedTag && !selectedDate }}
        >
          <Text
            style={[
              styles.tagTabText,
              { color: !selectedTag && !selectedDate ? c.primary : c.textSecondary },
              !selectedTag && !selectedDate && styles.tagTabTextActive,
            ]}
          >
            全部
          </Text>
        </TouchableOpacity>
        {tags.filter(tag => (tag.bbtalkCount ?? 0) > 0).map(tag => {
          const active = selectedTag === tag.id;
          return (
            <TouchableOpacity
              key={tag.id}
              style={[
                styles.tagTab,
                active && { backgroundColor: c.primaryLight },
              ]}
              onPress={() => { onSelectTag(tag.id); onResetAnim(); }}
              accessibilityRole="tab"
              accessibilityLabel={tag.name}
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.tagTabText,
                  { color: active ? c.primary : c.textSecondary },
                  active && styles.tagTabTextActive,
                ]}
              >
                {tag.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {onManage && <TouchableOpacity accessibilityRole="button" accessibilityLabel="管理标签"
        onPress={onManage} style={[styles.manage, { borderLeftColor: c.borderLight }]}>
        <Ionicons name="options-outline" size={22} color={c.textSecondary} />
      </TouchableOpacity>}
    </GlassSurface>
  );
}

export default React.memo(TagTabs);

const styles = StyleSheet.create({
  tagTabsWrap: { flexDirection: 'row', alignItems: 'stretch', marginHorizontal: 12, marginBottom: 8 },
  scroller: { flex: 1, minWidth: 0 },
  manage: { width: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderLeftWidth: 0.5 },
  tagTabsContent: { paddingHorizontal: 8, alignItems: 'stretch', gap: 4 },
  tagTab: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingVertical: 10, marginVertical: 4,
    minHeight: 44, borderRadius: 22,
  },
  tagTabText: { fontSize: 15 },
  tagTabTextActive: { fontWeight: '600' },
});
