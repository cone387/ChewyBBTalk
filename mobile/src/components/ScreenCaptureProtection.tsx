import { useEffect } from 'react';
import { Platform } from 'react-native';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';

/**
 * Prevent Android screenshots and recent-app thumbnails from exposing private content.
 * iOS uses AppBackgroundBlur for task switcher privacy; Web intentionally does nothing.
 */
export default function ScreenCaptureProtection() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    void preventScreenCaptureAsync().catch(() => {});

    return () => {
      void allowScreenCaptureAsync().catch(() => {});
    };
  }, []);

  return null;
}