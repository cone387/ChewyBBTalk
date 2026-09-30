import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ErrorFallbackProps {
  onRetry: () => void;
  errorMessage?: string;
}

/**
 * Fallback UI displayed when the Error Boundary catches a render error.
 * Shows a user-friendly Chinese message and a retry button.
 */
export default function ErrorFallback({ onRetry, errorMessage }: ErrorFallbackProps) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <View style={styles.container} accessibilityRole="alert" accessibilityLabel="应用出现错误">
      <Ionicons name="alert-circle-outline" size={48} color="#2563EB" style={{ marginBottom: 16 }} />
      <Text style={styles.title}>出了点问题</Text>
      <Text style={styles.message}>
        页面暂时无法显示，请尝试重新加载。
      </Text>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="重试"
        activeOpacity={0.7}
      >
        <Text style={styles.retryText}>重新加载</Text>
      </TouchableOpacity>
      {!!errorMessage && <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showDetails }}
        onPress={() => setShowDetails(value => !value)} style={{ minHeight: 44, justifyContent: 'center', marginTop: 12 }}>
        <Text style={{ color: '#71717A' }}>{showDetails ? '收起错误详情' : '查看错误详情'}</Text>
      </TouchableOpacity>}
      {showDetails && <Text selectable style={styles.message}>{errorMessage}</Text>}
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
