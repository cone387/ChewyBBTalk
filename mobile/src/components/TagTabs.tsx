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
          style={[styles.tagTab, !selectedTag && !selectedDate && styles.tagTabActive]}
          onPress={() => { onSelectTag(null); onResetAnim(); }}
        >
          <Text
            style={[
              styles.tagTabText,
              { color: !selectedTag && !selectedDate ? c.text : c.textTertiary },
              !selectedTag && !selectedDate && styles.tagTabTextActive,
            ]}
          >
            全部
          </Text>
          {!selectedTag && !selectedDate && (
            <View style={[styles.tagTabIndicator, { backgroundColor: c.primary }]} />
          )}
        </TouchableOpacity>
        {tags.map(tag => {
          const active = selectedTag === tag.id;
          return (
            <TouchableOpacity
              key={tag.id}
              style={[styles.tagTab, active && styles.tagTabActive]}
              onPress={() => { onSelectTag(active ? null : tag.id); onResetAnim(); }}
            >
              <Text
                style={[
                  styles.tagTabText,
                  { color: active ? c.text : c.textTertiary },
                  active && styles.tagTabTextActive,
                ]}
              >
                {tag.name}
              </Text>
              {active && <View style={[styles.tagTabIndicator, { backgroundColor: c.primary }]} />}
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
  tagTabsContent: { paddingHorizontal: 12 },
  tagTab: {
    alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  tagTabActive: {},
  tagTabText: { fontSize: 14 },
  tagTabTextActive: { fontWeight: '700' },
  tagTabIndicator: { width: 18, height: 3, borderRadius: 1.5, marginTop: 4 },
});
