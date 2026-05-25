/**
 * iOS 后台任务切换模糊遮罩
 * 当 App 进入后台（inactive/background）时，覆盖一层模糊遮罩保护隐私内容
 * 仅在 iOS 原生端生效
 */
import React, { useState, useEffect } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

export default function AppBackgroundBlur() {
  const [isBackground, setIsBackground] = useState(false);

  useEffect(() => {
    // 仅 iOS 需要此功能（Android 系统自带 FLAG_SECURE 或 recent apps 模糊）
    if (Platform.OS !== 'ios') return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      // inactive = 进入多任务切换器 / 下拉通知中心
      // background = 完全进入后台
      setIsBackground(nextState === 'inactive' || nextState === 'background');
    });

    return () => subscription.remove();
  }, []);

  if (!isBackground || Platform.OS !== 'ios') return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <BlurView intensity={80} tint="systemMaterial" style={StyleSheet.absoluteFill} />
      <View style={styles.iconWrap}>
        <Ionicons name="lock-closed" size={40} color="rgba(255,255,255,0.8)" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  iconWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
