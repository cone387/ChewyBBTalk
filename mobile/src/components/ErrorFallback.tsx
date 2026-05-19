import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ErrorFallbackProps {
  onRetry: () => void;
  errorMessage?: string;
}

/**
 * Fallback UI displayed when the Error Boundary catches a render error.
 * Shows a user-friendly Chinese message and a retry button.
 */
export default function ErrorFallback({ onRetry, errorMessage }: ErrorFallbackProps) {
  return (
    <View style={styles.container} accessibilityRole="alert" accessibilityLabel="应用出现错误">
      <Text style={styles.emoji}>😵</Text>
      <Text style={styles.title}>出了点问题</Text>
      <Text style={styles.message}>
        {errorMessage || '应用遇到了意外错误，请尝试重试'}
      </Text>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="重试"
        activeOpacity={0.7}
      >
        <Text style={styles.retryText}>重试</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    padding: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#18181B',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#71717A',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  retryButton: {
    minWidth: 120,
    minHeight: 44,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
