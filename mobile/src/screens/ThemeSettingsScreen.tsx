import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, THEMES } from '../theme/ThemeContext';

export default function ThemeSettingsScreen() {
  const { theme, setThemeKey } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={[styles.hint, { color: c.textSecondary }]}>选择你喜欢的主题风格</Text>
        {THEMES.map(t => {
          const active = t.key === theme.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.card, { backgroundColor: c.cardBg, borderColor: active ? t.colors.primary : c.borderLight, borderWidth: active ? 2 : 1 }]}
              onPress={() => setThemeKey(t.key)}
              activeOpacity={0.7}
            >
              <View style={styles.row}>
                <View style={[styles.preview, { borderColor: c.border }]}>
                  <View style={[styles.previewBar, { backgroundColor: t.colors.headerBg, borderColor: t.colors.border }]} />
                  <View style={[styles.previewBody, { backgroundColor: t.colors.background }]}>
                    <View style={[styles.previewCard, { backgroundColor: t.colors.cardBg }]} />
                    <View style={[styles.previewFab, { backgroundColor: t.colors.primary }]} />
                  </View>
                </View>
                <View style={styles.info}>
                  <Text style={[styles.name, { color: c.text }]}>{t.name}</Text>
                  <View style={styles.colorRow}>
                    {[t.colors.primary, t.colors.accent, t.colors.background, t.colors.text].map((color, i) => (
                      <View key={i} style={[styles.colorDot, { backgroundColor: color, borderColor: c.border }]} />
                    ))}
                  </View>
                </View>
                {active && <Ionicons name="checkmark-circle" size={24} color={t.colors.primary} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  hint: { fontSize: 13, marginBottom: 12 },
  card: { borderRadius: 16, padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  preview: { width: 60, height: 80, borderRadius: 8, overflow: 'hidden', borderWidth: 1 },
  previewBar: { height: 14, borderBottomWidth: 0.5 },
  previewBody: { flex: 1, padding: 4, justifyContent: 'space-between' },
  previewCard: { height: 20, borderRadius: 3, marginBottom: 2 },
  previewFab: { width: 14, height: 14, borderRadius: 7, alignSelf: 'flex-end' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  colorRow: { flexDirection: 'row', gap: 6 },
  colorDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1 },
});
