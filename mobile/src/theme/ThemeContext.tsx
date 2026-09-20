import { useColorScheme } from 'react-native';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { THEMES, type Theme } from './themes';
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
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
