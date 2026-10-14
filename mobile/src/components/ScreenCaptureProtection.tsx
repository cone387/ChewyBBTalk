import { useEffect } from 'react';
import { Platform } from 'react-native';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';

/**
 * Apply Expo's native screenshot/recording protection on both mobile platforms.
 * AppBackgroundBlur separately covers iOS task switching; Web has no equivalent API.
 */
export default function ScreenCaptureProtection() {
  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;

    void preventScreenCaptureAsync('app-privacy').catch(() => {});

    return () => {
      void allowScreenCaptureAsync('app-privacy').catch(() => {});
    };
  }, []);

  return null;
}
