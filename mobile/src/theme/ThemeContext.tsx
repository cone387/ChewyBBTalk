import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceSecondary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderLight: string;
  primary: string;
  primaryLight: string;
  accent: string;
  danger: string;
  dangerBg: string;
  headerBg: string;
  cardBg: string;
  overlay: string;
  fabShadow: string;
  avatarBg: string;
  lockBg: string;
  lockAccent: string;
}

export interface Theme {
  key: string;
  name: string;
  colors: ThemeColors;
}

const lightColors: ThemeColors = {
  background: '#F9FAFB',
  surface: '#fff',
  surfaceSecondary: '#F0F4FF',
  text: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  accent: '#7C3AED',
  danger: '#EF4444',
  dangerBg: '#FEF2F2',
  headerBg: '#fff',
  cardBg: '#fff',
  overlay: 'rgba(0,0,0,0.4)',
  fabShadow: '#2563EB',
  avatarBg: '#7C3AED',
  lockBg: '#F9FAFB',
  lockAccent: '#7C3AED',
};

const darkColors: ThemeColors = {
  background: '#0F172A',
  surface: '#1E293B',
  surfaceSecondary: '#162032',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  border: '#334155',
  borderLight: '#283548',
  primary: '#3B82F6',
  primaryLight: '#1E3A5F',
  accent: '#8B5CF6',
  danger: '#F87171',
  dangerBg: '#1C1917',
  headerBg: '#1E293B',
  cardBg: '#1E293B',
  overlay: 'rgba(0,0,0,0.6)',
  fabShadow: '#3B82F6',
  avatarBg: '#8B5CF6',
  lockBg: '#0F172A',
  lockAccent: '#8B5CF6',
};

const greenColors: ThemeColors = {
  ...lightColors,
  primary: '#059669',
  primaryLight: '#ECFDF5',
  accent: '#10B981',
  fabShadow: '#059669',
  avatarBg: '#059669',
  lockAccent: '#059669',
};

const roseColors: ThemeColors = {
  ...lightColors,
  primary: '#E11D48',
  primaryLight: '#FFF1F2',
  accent: '#F43F5E',
  fabShadow: '#E11D48',
  avatarBg: '#E11D48',
  lockAccent: '#E11D48',
};

const orangeColors: ThemeColors = {
  ...lightColors,
  primary: '#EA580C',
  primaryLight: '#FFF7ED',
  accent: '#F97316',
  fabShadow: '#EA580C',
  avatarBg: '#EA580C',
  lockAccent: '#EA580C',
};

export const THEMES: Theme[] = [
  { key: 'light', name: '默认蓝', colors: lightColors },
  { key: 'dark', name: '深色', colors: darkColors },
  { key: 'green', name: '清新绿', colors: greenColors },
  { key: 'rose', name: '玫瑰红', colors: roseColors },
  { key: 'orange', name: '活力橙', colors: orangeColors },
];

interface ThemeContextType {
  theme: Theme;
  setThemeKey: (key: string) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: THEMES[0],
  setThemeKey: () => {},
});

const THEME_STORAGE_KEY = 'bbtalk_theme_key';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(THEMES[0]);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(key => {
      if (key) {
        const found = THEMES.find(t => t.key === key);
        if (found) setTheme(found);
      }
    });
  }, []);

  const setThemeKey = useCallback((key: string) => {
    const found = THEMES.find(t => t.key === key);
    if (found) {
      setTheme(found);
      AsyncStorage.setItem(THEME_STORAGE_KEY, key);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setThemeKey }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
