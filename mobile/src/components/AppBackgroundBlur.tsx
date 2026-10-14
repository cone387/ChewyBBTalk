/**
 * iOS 原生窗口遮罩与 JS 后备遮罩。
 * 原生层在失去焦点时即时覆盖，包括原生 Modal；JS 层初始化时也检查当前状态。
 */
import React, { useState, useEffect } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { enableAppSwitcherProtectionAsync, disableAppSwitcherProtectionAsync } from 'expo-screen-capture';

export default function AppBackgroundBlur() {
  const [isBackground, setIsBackground] = useState(() => AppState.currentState !== 'active');

  useEffect(() => {
    // 仅 iOS 需要此功能（Android 系统自带 FLAG_SECURE 或 recent apps 模糊）
    if (Platform.OS !== 'ios') return;

    // Native lifecycle coverage also sits above native Modals and does not wait for JS.
    // The config plugin replaces Expo's fading root-view blur with a window curtain.
    void enableAppSwitcherProtectionAsync(1).catch(() => {});

    const subscription = AppState.addEventListener('change', (nextState) => {
      // inactive = 进入多任务切换器 / 下拉通知中心
      // background = 完全进入后台
      setIsBackground(nextState !== 'active');
    });

    return () => {
      subscription.remove();
      void disableAppSwitcherProtectionAsync().catch(() => {});
    };
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
    backgroundColor: '#111827',
  },
  iconWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
