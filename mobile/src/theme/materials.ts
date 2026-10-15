import type { Theme } from './themes';

export const UI = {
  radius: { field: 16, card: 22, sheet: 28, pill: 999 },
  touch: 48,
  tabBarHeight: 60,
  // Space for the floating dock, its outer margins, and scroll clearance (plus safe area).
  tabBarClearance: 88,
} as const;

export function glassPalette(theme: Theme) {
  const dark = theme.key === 'dark';
  return {
    border: dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.88)',
    tint: dark ? 'rgba(28,32,42,0.55)' : 'rgba(255,255,255,0.55)',
    shadow: dark ? 0.28 : 0.09,
  };
}
