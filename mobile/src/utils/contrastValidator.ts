/**
 * WCAG 2.1 Color Contrast Validator
 * Pure functions for calculating relative luminance and contrast ratios.
 */

export interface ContrastResult {
  ratio: number;
  passesAA: boolean;       // >= 4.5:1 for normal text
  passesAALarge: boolean;  // >= 3:1 for large text / UI components
}

export interface ContrastViolation {
  pair: string;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
}

/**
 * Convert a hex color string to relative luminance per WCAG 2.1.
 * Supports #RGB, #RRGGBB formats.
 */
export function hexToLuminance(hex: string): number {
  const cleaned = hex.replace('#', '');
  let r: number, g: number, b: number;

  if (cleaned.length === 3) {
    r = parseInt(cleaned[0] + cleaned[0], 16) / 255;
    g = parseInt(cleaned[1] + cleaned[1], 16) / 255;
    b = parseInt(cleaned[2] + cleaned[2], 16) / 255;
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.slice(0, 2), 16) / 255;
    g = parseInt(cleaned.slice(2, 4), 16) / 255;
    b = parseInt(cleaned.slice(4, 6), 16) / 255;
  } else {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  // Apply sRGB linearization
  const linearize = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const rLin = linearize(r);
  const gLin = linearize(g);
  const bLin = linearize(b);

  // Relative luminance formula
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Calculate the contrast ratio between two colors.
 * Returns a ContrastResult with the ratio and pass/fail for AA levels.
 */
export function getContrastRatio(foreground: string, background: string): ContrastResult {
  const lumFg = hexToLuminance(foreground);
  const lumBg = hexToLuminance(background);

  const lighter = Math.max(lumFg, lumBg);
  const darker = Math.min(lumFg, lumBg);

  const ratio = (lighter + 0.05) / (darker + 0.05);

  return {
    ratio: Math.round(ratio * 100) / 100,
    passesAA: ratio >= 4.5,
    passesAALarge: ratio >= 3,
  };
}

/**
 * Validate all critical color pairs in a theme against WCAG AA requirements.
 * Returns an array of violations (empty = all pass).
 */
export function validateThemeContrast(colors: {
  text: string;
  textSecondary: string;
  textTertiary: string;
  background: string;
  surface: string;
  primary: string;
}): ContrastViolation[] {
  const violations: ContrastViolation[] = [];

  const checks: Array<{ pair: string; fg: string; bg: string; required: number }> = [
    { pair: 'text/background', fg: colors.text, bg: colors.background, required: 4.5 },
    { pair: 'textSecondary/background', fg: colors.textSecondary, bg: colors.background, required: 4.5 },
    { pair: 'textSecondary/surface', fg: colors.textSecondary, bg: colors.surface, required: 4.5 },
    { pair: 'textTertiary/surface', fg: colors.textTertiary, bg: colors.surface, required: 3 },
    { pair: 'primary/background', fg: colors.primary, bg: colors.background, required: 3 },
  ];

  for (const check of checks) {
    const result = getContrastRatio(check.fg, check.bg);
    if (result.ratio < check.required) {
      violations.push({
        pair: check.pair,
        foreground: check.fg,
        background: check.bg,
        ratio: result.ratio,
        required: check.required,
      });
    }
  }

  return violations;
}
