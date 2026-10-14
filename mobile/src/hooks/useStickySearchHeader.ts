import { useCallback, useMemo, useState } from 'react';
import { Animated, Platform, type LayoutChangeEvent } from 'react-native';

/** Moves the search row offscreen while leaving the navigation row visible. */
export function useStickySearchHeader() {
  const [scrollY] = useState(() => new Animated.Value(0));
  const [searchHeight, setSearchHeight] = useState(60);
  const [navigationHeight, setNavigationHeight] = useState(48);

  const onSearchLayout = useCallback((event: LayoutChangeEvent) => {
    setSearchHeight(Math.max(1, event.nativeEvent.layout.height));
  }, []);
  const onNavigationLayout = useCallback((event: LayoutChangeEvent) => {
    setNavigationHeight(Math.max(1, event.nativeEvent.layout.height));
  }, []);

  const translateY = useMemo(() => scrollY.interpolate({
    inputRange: [0, searchHeight],
    outputRange: [0, -searchHeight],
    extrapolate: 'clamp',
  }), [scrollY, searchHeight]);

  const onScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: Platform.OS !== 'web' },
  ), [scrollY]);

  return {
    scrollY,
    onScroll,
    translateY,
    searchHeight,
    navigationHeight,
    onSearchLayout,
    onNavigationLayout,
  };
}
