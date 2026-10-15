import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useGlassPreferences } from '../theme/GlassPreferences';

export default function LoadingPlaceholder() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { reduceMotion } = useGlassPreferences();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) { opacity.setValue(1); return; }
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <ActivityIndicator size="large" color={c.primary} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
});
