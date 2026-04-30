import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, iconColor, title, hint, actionLabel, onAction }: EmptyStateProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      speed: 12,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  }, []);

  const color = iconColor || c.primary;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: c.cardBg },
        { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: color + '12' }]}>
        <Ionicons name={icon} size={36} color={color} />
      </View>
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      {hint && <Text style={[styles.hint, { color: c.textTertiary }]}>{hint}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: c.primaryLight }]} onPress={onAction} activeOpacity={0.7}>
          <Text style={[styles.actionText, { color: c.primary }]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 40,
    marginTop: 40,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  hint: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  actionBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  actionText: { fontSize: 14, fontWeight: '600' },
});
