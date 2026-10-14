import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAppPreviewProtection, getPrivacyPreviewRevision, resumePrivacyPreview } from '../services/nativePrivacy';
import { historyPrivacyIsSuspended, historyPrivacyResumePending, subscribeHistoryPrivacy } from '../services/historyPrivacy';
import { getPrivacyPreferencesRevision, subscribePrivacyPreferences } from '../services/privacyPreferences';

let nativeQueue = Promise.resolve();
function enqueue(action: () => Promise<void>) {
  nativeQueue = nativeQueue.then(action).catch(() => { /* JS blur remains as a fallback. */ });
}

/** Preview privacy is independent from capture restrictions and authentication. */
export default function AppBackgroundBlur() {
  const [state, setState] = useState(AppState.currentState);
  const [foregroundEpoch, setForegroundEpoch] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const transition = useRef(0);
  const suspended = useSyncExternalStore(subscribeHistoryPrivacy, historyPrivacyIsSuspended, historyPrivacyIsSuspended);
  const resumePending = useSyncExternalStore(subscribeHistoryPrivacy, historyPrivacyResumePending, historyPrivacyResumePending);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    let readVersion = 0;
    const load = async () => {
      const version = ++readVersion;
      const revision = getPrivacyPreferencesRevision();
      let value = true;
      try { value = await AsyncStorage.getItem('privacy_hide_app_preview') !== 'false'; } catch {}
      if (!alive || version !== readVersion || revision !== getPrivacyPreferencesRevision()) return;
      setEnabled(value);
      enqueue(() => setAppPreviewProtection(value));
    };
    void load();
    const stop = subscribePrivacyPreferences(() => { void load(); });
    const subscription = AppState.addEventListener('change', next => {
      transition.current += 1;
      setState(next);
      if (next === 'active') setForegroundEpoch(epoch => epoch + 1);
    });
    return () => { alive = false; stop(); subscription.remove(); enqueue(() => setAppPreviewProtection(false)); };
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web' || state !== 'active' || suspended || resumePending) return;
    let alive = true;
    let frame: number | undefined;
    const version = transition.current;
    const current = () => alive && version === transition.current && AppState.currentState === 'active'
      && !historyPrivacyIsSuspended() && !historyPrivacyResumePending();
    // Release the native window overlay after the foreground lock decision has rendered.
    void getPrivacyPreviewRevision().then(revision => {
      if (!current()) return;
      frame = requestAnimationFrame(() => enqueue(async () => {
        // Recheck when queued work actually runs; native also rejects an old token.
        if (current()) await resumePrivacyPreview(revision);
      }));
    }).catch(() => { /* A later activation retries the native handshake. */ });
    return () => { alive = false; if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [state, suspended, resumePending, enabled, foregroundEpoch]);
  if (Platform.OS === 'web' || !enabled || (state === 'active' && !suspended && !resumePending)) return null;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ ...StyleSheet.absoluteFillObject, zIndex: 9999 }}>
    <BlurView intensity={100} tint="systemMaterial" style={StyleSheet.absoluteFillObject} />
  </View>;
}
