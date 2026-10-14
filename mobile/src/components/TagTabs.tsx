import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Tag } from '../types';
import type { Theme } from '../theme/ThemeContext';
import PrivacyQuickLock from './PrivacyQuickLock';

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
    <View style={[styles.tagTabsWrap, { backgroundColor: c.background, borderBottomColor: c.borderLight }]}>
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
            !selectedTag && !selectedDate && { borderBottomColor: c.primary },
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
                active && { borderBottomColor: c.primary },
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
      <PrivacyQuickLock />
      {onManage && <TouchableOpacity accessibilityRole="button" accessibilityLabel="管理标签"
        onPress={onManage} style={[styles.manage, { borderLeftColor: c.borderLight }]}>
        <Ionicons name="options-outline" size={22} color={c.textSecondary} />
      </TouchableOpacity>}
    </View>
  );
}

export default React.memo(TagTabs);

const styles = StyleSheet.create({
  tagTabsWrap: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 0.5 },
  scroller: { flex: 1, minWidth: 0 },
  manage: { width: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderLeftWidth: 0.5 },
  tagTabsContent: { paddingHorizontal: 8, alignItems: 'stretch', gap: 4 },
  tagTab: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 12, marginHorizontal: 2,
    minHeight: 48, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tagTabText: { fontSize: 15 },
  tagTabTextActive: { fontWeight: '600' },
});
