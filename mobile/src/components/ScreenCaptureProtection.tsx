import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import { getPrivacyPreferencesRevision, subscribePrivacyPreferences } from '../services/privacyPreferences';

// Share one queue across remounts: a previous cleanup must never undo a new opt-in.
const captureOwners = new Map<symbol, boolean>();
let nativeQueue = Promise.resolve();
let protectionApplied = false;
let protectionMayBeApplied = false;

function reconcileCaptureProtection() {
  nativeQueue = nativeQueue.then(async () => {
    const requested = [...captureOwners.values()].some(Boolean);
    if (requested && !protectionApplied) {
      // A rejected native operation can still have partially changed native state.
      protectionMayBeApplied = true;
      try {
        await preventScreenCaptureAsync('app-privacy');
      } catch (error) {
        // Expo registers the key before awaiting native completion. Release that
        // ownership after failure so a later foreground refresh can really retry.
        try {
          await allowScreenCaptureAsync('app-privacy');
          protectionMayBeApplied = false;
        } catch { /* Keep the uncertain native state eligible for cleanup. */ }
        throw error;
      }
      protectionApplied = true;
    } else if (!requested && protectionMayBeApplied) {
      // A failed release leaves native state uncertain; the next opt-in must reapply.
      protectionApplied = false;
      await allowScreenCaptureAsync('app-privacy');
      protectionMayBeApplied = false;
    }
  }).catch(() => {
    console.warn('[privacy] Unable to update optional screen capture protection.');
  });
}

/** Explicit opt-in only. Background preview shielding is a separate preference. */
export default function ScreenCaptureProtection() {
  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;

    const owner = Symbol('screen-capture');
    captureOwners.set(owner, false);
    let mounted = true;
    let readVersion = 0;
    const reload = async () => {
      const version = ++readVersion;
      const revision = getPrivacyPreferencesRevision();
      try {
        const value = await AsyncStorage.getItem('privacy_block_capture');
        if (!mounted || version !== readVersion || revision !== getPrivacyPreferencesRevision()) return;
        captureOwners.set(owner, value === 'true');
        reconcileCaptureProtection();
      } catch {
        if (mounted && version === readVersion) {
          console.warn('[privacy] Unable to read optional screen capture preference.');
        }
      }
    };
    const unsubscribe = subscribePrivacyPreferences(() => { void reload(); });
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void reload();
    });
    void reload();

    return () => {
      mounted = false;
      unsubscribe();
      subscription.remove();
      captureOwners.delete(owner);
      reconcileCaptureProtection();
    };
  }, []);

  return null;
}
