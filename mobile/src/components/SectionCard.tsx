import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface SectionCardProps {
  title?: string;
  children: React.ReactNode;
}

export default function SectionCard({ title, children }: SectionCardProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={styles.section}>
      {title && <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>{title}</Text>}
      <View style={[styles.card, { backgroundColor: c.cardBg }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 13, fontWeight: '500', marginBottom: 6, marginLeft: 4 },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
});
