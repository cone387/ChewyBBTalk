import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

interface UndoToastProps {
  visible: boolean;
  message?: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;
}

/**
 * UndoToast — 底部撤销提示条。
 * 删除操作后从底部滑入，显示"已删除"文案和"撤销"按钮，
 * duration 毫秒后自动滑出并调用 onDismiss。
 */
export default function UndoToast({
  visible,
  message = '已删除',
  onUndo,
  onDismiss,
  duration = 3000,
}: UndoToastProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(100)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      // Slide in
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
      }).start();

      // Auto-dismiss timer
      timerRef.current = setTimeout(() => {
        slideOut(onDismiss);
      }, duration);
    } else {
      // Reset position immediately when hidden externally
      translateY.setValue(100);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible]);

  const slideOut = (callback: () => void) => {
    Animated.timing(translateY, {
      toValue: 100,
      duration: 250,
      useNativeDriver: true,
    }).start(() => callback());
  };

  const handleUndo = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    slideOut(onUndo);
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: c.text,
          paddingBottom: Math.max(insets.bottom, 12),
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.message, { color: c.background }]}>{message}</Text>
        <TouchableOpacity onPress={handleUndo} hitSlop={8}>
          <Text style={[styles.undoBtn, { color: c.primary }]}>撤销</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    borderRadius: 12,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  message: {
    fontSize: 15,
    fontWeight: '500',
  },
  undoBtn: {
    fontSize: 15,
    fontWeight: '700',
  },
});
