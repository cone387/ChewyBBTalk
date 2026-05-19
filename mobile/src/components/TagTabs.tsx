import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import type { Tag } from '../types';
import type { Theme } from '../theme/ThemeContext';

export interface TagTabsProps {
  tags: Tag[];
  selectedTag: string | null;
  selectedDate: string | null;
  onSelectTag: (tagId: string | null) => void;
  onResetAnim: () => void;
  scrollRef: any;
  theme: Theme;
}

function TagTabs({
  tags,
  selectedTag,
  selectedDate,
  onSelectTag,
  onResetAnim,
  scrollRef,
  theme,
}: TagTabsProps) {
  const c = theme.colors;

  return (
    <View style={[styles.tagTabsWrap, { backgroundColor: c.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        ref={scrollRef as React.RefObject<ScrollView>}
        contentContainerStyle={styles.tagTabsContent}
      >
        <TouchableOpacity
          style={[
            styles.tagTab,
            !selectedTag && !selectedDate && { backgroundColor: c.primary, borderRadius: 20 },
          ]}
          onPress={() => { onSelectTag(null); onResetAnim(); }}
          accessibilityRole="tab"
          accessibilityLabel="全部"
          accessibilityState={{ selected: !selectedTag && !selectedDate }}
        >
          <Text
            style={[
              styles.tagTabText,
              { color: !selectedTag && !selectedDate ? '#fff' : c.textSecondary },
              !selectedTag && !selectedDate && styles.tagTabTextActive,
            ]}
          >
            全部
          </Text>
        </TouchableOpacity>
        {tags.map(tag => {
          const active = selectedTag === tag.id;
          return (
            <TouchableOpacity
              key={tag.id}
              style={[
                styles.tagTab,
                active && { backgroundColor: c.primary, borderRadius: 20 },
              ]}
              onPress={() => { onSelectTag(active ? null : tag.id); onResetAnim(); }}
              accessibilityRole="tab"
              accessibilityLabel={tag.name}
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.tagTabText,
                  { color: active ? '#fff' : c.textSecondary },
                  active && styles.tagTabTextActive,
                ]}
              >
                {tag.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default React.memo(TagTabs);

const styles = StyleSheet.create({
  tagTabsWrap: {},
  tagTabsContent: { paddingHorizontal: 12, alignItems: 'center', gap: 4 },
  tagTab: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 2,
    minHeight: 44,
  },
  tagTabText: { fontSize: 15 },
  tagTabTextActive: { fontWeight: '600' },
});
