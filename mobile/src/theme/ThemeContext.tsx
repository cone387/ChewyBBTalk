import { Appearance, Platform, useColorScheme } from 'react-native';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { THEMES, type Theme } from './themes';
import { GlassPreferencesProvider } from './GlassPreferences';
import { setDialogColorScheme } from './dialogTheme';
export { THEMES } from './themes';
export type { Theme, ThemeColors } from './themes';

interface ThemeContextType {
  theme: Theme;
  setThemeKey: (key: string) => void;
  themePreference: string;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: THEMES[0],
  setThemeKey: () => {},
  themePreference: 'system',
});

const THEME_STORAGE_KEY = 'bbtalk_theme_key';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themePreference, setPreference] = useState('system');
  const resolvedKey = themePreference === 'system' ? systemScheme === 'dark' ? 'dark' : 'light' : themePreference;
  const theme = THEMES.find(t => t.key === resolvedKey) || THEMES[0];
  // Native keyboards and navigation menus inherit the window's UIKit trait.
  // Use the preference here: forcing the resolved system color would prevent
  // useColorScheme from following later device changes.
  useEffect(() => {
    if (Platform.OS === 'ios') Appearance.setColorScheme(themePreference === 'system' ? null : themePreference === 'dark' ? 'dark' : 'light');
  }, [themePreference]);
  useEffect(() => {
    if (Platform.OS === 'ios') return () => Appearance.setColorScheme(null);
  }, []);
  useEffect(() => { setDialogColorScheme(theme.key === 'dark' ? 'dark' : 'light'); }, [theme.key]);
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(key => {
      if (key === 'system' || THEMES.some(t => t.key === key)) setPreference(key!);
    }).catch(() => {});
  }, []);
  const setThemeKey = useCallback((key: string) => {
    if (key !== 'system' && !THEMES.some(t => t.key === key)) return;
    setPreference(key);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, key).catch(() => {});
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setThemeKey, themePreference }}>
      <GlassPreferencesProvider>{children}</GlassPreferencesProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
