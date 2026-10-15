import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../theme/ThemeContext';
import GlassSurface from './GlassSurface';

export interface SearchBarProps {
  visible: boolean;
  searchText: string;
  searchHistory: string[];
  onSearchTextChange: (text: string) => void;
  onSubmit: (text: string) => void;
  onClearHistory: () => void;
  onHistoryItemPress: (term: string) => void;
  onClose: () => void;
  theme: Theme;
}

function SearchBar({
  visible,
  searchText,
  searchHistory,
  onSearchTextChange,
  onSubmit,
  onClearHistory,
  onHistoryItemPress,
  onClose,
  theme,
}: SearchBarProps) {
  if (!visible) return null;

  const c = theme.colors;

  return (
    <>
      {/* Search history panel */}
      {!searchText && searchHistory.length > 0 && (
        <GlassSurface theme={theme} elevated style={styles.searchHistoryWrap}>
          <View style={styles.searchHistoryHeader}>
            <Text style={[styles.searchHistoryTitle, { color: c.textSecondary }]}>最近搜索</Text>
            <TouchableOpacity onPress={onClearHistory} accessibilityRole="button" accessibilityLabel="清除搜索历史" style={styles.clearButton}>
              <Text style={[styles.searchHistoryClear, { color: c.textTertiary }]}>清除</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.searchHistoryTags}>
            {searchHistory.map((term, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.searchHistoryChip, { backgroundColor: c.borderLight }]}
                onPress={() => onHistoryItemPress(term)}
                accessibilityRole="button" accessibilityLabel={`搜索：${term}`}
              >
                <Text style={[styles.searchHistoryChipText, { color: c.text }]}>{term}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </GlassSurface>
      )}
    </>
  );
}

/** Inline search input for the header bar */
export function SearchInput({
  searchText,
  onSearchTextChange,
  onSubmit,
  onFocus,
  onBlur,
  theme,
}: {
  searchText: string;
  onSearchTextChange: (text: string) => void;
  onSubmit: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  theme: Theme;
}) {
  const c = theme.colors;
  return (
    <GlassSurface theme={theme} radius={26} style={styles.searchBar}>
      <Ionicons name="search" size={16} color={c.textTertiary} />
      <TextInput
        style={[styles.searchInput, { color: c.text }]}
        placeholder="搜索碎碎念..."
        placeholderTextColor={c.textTertiary}
        value={searchText}
        onChangeText={onSearchTextChange}
        onFocus={onFocus}
        onBlur={onBlur}
        onSubmitEditing={() => onSubmit(searchText)}
        returnKeyType="search"
        accessibilityLabel="搜索碎碎念"
      />
      {searchText.length > 0 && (
        <TouchableOpacity style={styles.clearButton} onPress={() => onSearchTextChange('')} accessibilityRole="button" accessibilityLabel="清除搜索">
          <Ionicons name="close-circle" size={18} color={c.textTertiary} />
        </TouchableOpacity>
      )}
    </GlassSurface>
  );
}

export default React.memo(SearchBar);

const styles = StyleSheet.create({
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 26, paddingLeft: 16, minHeight: 48,
  },
  searchInput: {
    flex: 1, minWidth: 0, fontSize: 16, paddingVertical: 0, paddingHorizontal: 0,
    lineHeight: 20, includeFontPadding: false,
  },
  searchHistoryWrap: { marginHorizontal: 12, marginTop: 6, paddingHorizontal: 16, paddingVertical: 10 },
  searchHistoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  searchHistoryTitle: { fontSize: 12, fontWeight: '500' },
  searchHistoryClear: { fontSize: 12 },
  searchHistoryTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  clearButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  searchHistoryChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  searchHistoryChipText: { fontSize: 13 },
});
