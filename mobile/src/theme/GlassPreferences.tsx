import React, { createContext, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// Stay opaque until the system preference is known; never flash transparent content.
const GlassPreferences = createContext({ ready: false, reduceTransparency: true, reduceMotion: true });

export function GlassPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState({ ready: false, reduceTransparency: true, reduceMotion: true });
  useEffect(() => {
    let active = true;
    let transparencyChanged = false;
    let motionChanged = false;
    const transparency = AccessibilityInfo?.addEventListener?.('reduceTransparencyChanged', value => {
      transparencyChanged = true;
      setPreferences(p => ({ ...p, reduceTransparency: value }));
    });
    const motion = AccessibilityInfo?.addEventListener?.('reduceMotionChanged', value => {
      motionChanged = true;
      setPreferences(p => ({ ...p, reduceMotion: value }));
    });
    const media = Platform?.OS === 'web' && typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-transparency: reduce)') : undefined;
    const motionMedia = Platform?.OS === 'web' && typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;
    const onMotionMediaChange = () => {
      motionChanged = true;
      setPreferences(p => ({ ...p, reduceMotion: Boolean(motionMedia?.matches) }));
    };
    const onMediaChange = () => {
      transparencyChanged = true;
      setPreferences(p => ({ ...p, reduceTransparency: Boolean(media?.matches) }));
    };
    media?.addEventListener?.('change', onMediaChange);
    motionMedia?.addEventListener?.('change', onMotionMediaChange);
    void Promise.all([
      Platform?.OS === 'ios' ? AccessibilityInfo?.isReduceTransparencyEnabled?.() ?? true : Boolean(media?.matches),
      motionMedia ? motionMedia.matches : AccessibilityInfo?.isReduceMotionEnabled?.() ?? true,
    ]).then(([reduceTransparency, reduceMotion]) => {
      if (active) setPreferences(p => ({ ready: true,
        reduceTransparency: transparencyChanged ? p.reduceTransparency : reduceTransparency,
        reduceMotion: motionChanged ? p.reduceMotion : reduceMotion }));
    }).catch(() => { /* Opaque fallback if the accessibility bridge fails. */ });
    return () => {
      active = false; transparency?.remove(); motion?.remove();
      media?.removeEventListener?.('change', onMediaChange);
      motionMedia?.removeEventListener?.('change', onMotionMediaChange);
    };
  }, []);
  return <GlassPreferences.Provider value={preferences}>{children}</GlassPreferences.Provider>;
}

export const useGlassPreferences = () => useContext(GlassPreferences);
