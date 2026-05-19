import { useState, useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Hook that reads the user's "Reduce Motion" system preference.
 * Returns true when the user prefers reduced motion (animations should be minimized).
 * Subscribes to live changes so the UI updates if the user toggles the setting.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // Web doesn't support AccessibilityInfo
    if (Platform.OS === 'web') {
      const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      if (mq) {
        setReducedMotion(mq.matches);
        const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
      }
      return;
    }

    // Native: read initial value
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);

    // Subscribe to changes
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );

    return () => {
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}
