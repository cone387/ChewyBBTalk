import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/**
 * SkeletonCard — 骨架屏占位卡片，模拟 BBTalk 卡片布局。
 * 使用 Animated.loop + Animated.timing 实现脉冲闪烁效果。
 */
export default function SkeletonCard() {
  const { theme } = useTheme();
  const c = theme.colors;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  const barStyle = (width: string | number, height: number = 14, extra?: object) => [
    styles.bar,
    { width, height, borderRadius: height / 2, backgroundColor: c.borderLight },
    extra,
  ];

  const Shimmer = ({ width, height = 14, style }: { width: string | number; height?: number; style?: object }) => (
    <Animated.View style={[...barStyle(width, height, style), { opacity }]} />
  );

  return (
    <View style={[styles.card, { backgroundColor: c.cardBg }]} accessible={false} accessibilityElementsHidden={true}>
      {/* 文字行占位 — 模拟 3-4 行 Markdown 内容 */}
      <Shimmer width="90%" height={14} />
      <Shimmer width="100%" height={14} style={{ marginTop: 10 }} />
      <Shimmer width="75%" height={14} style={{ marginTop: 10 }} />
      <Shimmer width="40%" height={14} style={{ marginTop: 10 }} />

      {/* 标签行占位 */}
      <View style={styles.tagRow}>
        <Shimmer width={56} height={22} />
        <Shimmer width={48} height={22} />
      </View>

      {/* 附件区占位 — 两个缩略图方块 */}
      <View style={styles.attachmentRow}>
        <Animated.View style={[styles.thumbPlaceholder, { backgroundColor: c.borderLight, opacity }]} />
        <Animated.View style={[styles.thumbPlaceholder, { backgroundColor: c.borderLight, opacity }]} />
      </View>

      {/* 底部行占位 — 时间 + 图标 */}
      <View style={styles.footer}>
        <Shimmer width={80} height={10} />
        <Shimmer width={16} height={16} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 18,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  bar: {},
  tagRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
  },
  attachmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  thumbPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
});
