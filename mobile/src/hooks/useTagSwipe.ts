import { useRef, useCallback, useMemo } from 'react';
import { Animated, PanResponder, ScrollView } from 'react-native';
import type { Tag } from '../types';

interface UseTagSwipeOptions {
  tags: Tag[];
  selectedTag: string | null;
  showTagTabs: boolean;
  onSelectTag?: (tagId: string | null) => void;
}

export function useTagSwipe({ tags, selectedTag, showTagTabs, onSelectTag }: UseTagSwipeOptions) {
  const listSlideAnim = useRef(new Animated.Value(0)).current;
  const tagScrollRef = useRef<ScrollView>(null);
  const swipingRef = useRef(false);

  const allTagIds = useMemo(() => [null, ...tags.map(t => t.id)], [tags]);
  const currentTagIdx = selectedTag ? allTagIds.indexOf(selectedTag) : 0;

  const switchTag = useCallback((direction: 'left' | 'right') => {
    if (!showTagTabs || !onSelectTag || tags.length === 0) return;
    const nextIdx = direction === 'left'
      ? Math.min(currentTagIdx + 1, allTagIds.length - 1)
      : Math.max(currentTagIdx - 1, 0);
    if (nextIdx === currentTagIdx) return;
    const slideOut = direction === 'left' ? -1 : 1;
    Animated.timing(listSlideAnim, { toValue: slideOut * 300, duration: 120, useNativeDriver: true }).start(() => {
      onSelectTag(allTagIds[nextIdx]);
      listSlideAnim.setValue(-slideOut * 300);
      Animated.spring(listSlideAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
    });
    if (tagScrollRef.current) tagScrollRef.current.scrollTo({ x: Math.max(0, nextIdx * 70 - 100), animated: true });
  }, [showTagTabs, onSelectTag, tags, currentTagIdx, allTagIds]);

  const switchTagRef = useRef(switchTag); switchTagRef.current = switchTag;
  const showTagTabsRef = useRef(showTagTabs); showTagTabsRef.current = showTagTabs;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        showTagTabsRef.current && Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderGrant: () => { swipingRef.current = true; },
      onPanResponderMove: (_, gesture) => { listSlideAnim.setValue(gesture.dx * 0.3); },
      onPanResponderRelease: (_, gesture) => {
        swipingRef.current = false;
        if (Math.abs(gesture.dx) > 60 || Math.abs(gesture.vx) > 0.5) switchTagRef.current(gesture.dx < 0 ? 'left' : 'right');
        else Animated.spring(listSlideAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => {
        swipingRef.current = false;
        Animated.spring(listSlideAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
      },
    })
  ).current;

  const resetSlideAnim = useCallback(() => { listSlideAnim.setValue(0); }, []);

  return {
    listSlideAnim,
    tagScrollRef,
    panResponder,
    resetSlideAnim,
  };
}
