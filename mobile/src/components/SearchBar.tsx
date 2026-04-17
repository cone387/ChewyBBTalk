import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../theme/ThemeContext';

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
        <View style={[styles.searchHistoryWrap, { backgroundColor: c.cardBg, borderBottomColor: c.border }]}>
          <View style={styles.searchHistoryHeader}>
            <Text style={[styles.searchHistoryTitle, { color: c.textSecondary }]}>最近搜索</Text>
            <TouchableOpacity onPress={onClearHistory}>
              <Text style={[styles.searchHistoryClear, { color: c.textTertiary }]}>清除</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.searchHistoryTags}>
            {searchHistory.map((term, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.searchHistoryChip, { backgroundColor: c.borderLight }]}
                onPress={() => onHistoryItemPress(term)}
              >
                <Text style={[styles.searchHistoryChipText, { color: c.text }]}>{term}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </>
  );
}

/** Inline search input for the header bar */
export function SearchInput({
  searchText,
  onSearchTextChange,
  onSubmit,
  theme,
}: {
  searchText: string;
  onSearchTextChange: (text: string) => void;
  onSubmit: (text: string) => void;
  theme: Theme;
}) {
  const c = theme.colors;
  return (
    <View style={[styles.searchBar, { backgroundColor: c.borderLight }]}>
      <Ionicons name="search" size={16} color={c.textTertiary} />
      <TextInput
        style={[styles.searchInput, { color: c.text }]}
        placeholder="搜索碎碎念..."
        placeholderTextColor={c.textTertiary}
        value={searchText}
        onChangeText={onSearchTextChange}
        autoFocus
        onSubmitEditing={() => onSubmit(searchText)}
        returnKeyType="search"
      />
      {searchText.length > 0 && (
        <TouchableOpacity onPress={() => onSearchTextChange('')}>
          <Ionicons name="close-circle" size={18} color={c.textTertiary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export default React.memo(SearchBar);

const styles = StyleSheet.create({
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, paddingHorizontal: 10, marginHorizontal: 8, height: 38,
  },
  searchInput: {
    flex: 1, fontSize: 15, paddingVertical: 0, paddingHorizontal: 0,
    lineHeight: 20, includeFontPadding: false,
  },
  searchHistoryWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5 },
  searchHistoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  searchHistoryTitle: { fontSize: 12, fontWeight: '500' },
  searchHistoryClear: { fontSize: 12 },
  searchHistoryTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  searchHistoryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  searchHistoryChipText: { fontSize: 13 },
});
