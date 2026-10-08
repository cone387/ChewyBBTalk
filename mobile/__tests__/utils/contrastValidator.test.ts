import {
  hexToLuminance,
  getContrastRatio,
  validateThemeContrast,
} from '../../src/utils/contrastValidator';

const accessibleTheme = {
  text: '#000000',
  textSecondary: '#333333',
  textTertiary: '#666666',
  background: '#FFFFFF',
  surface: '#FAFAFA',
  primary: '#0000CC',
};

const crampedTheme = {
  text: '#666667',
  textSecondary: '#666667',
  textTertiary: '#555556',
  background: '#000000',
  surface: '#111112',
  primary: '#222223',
};

describe('hexToLuminance', () => {
  it('linearizes 6-digit hex channels per WCAG 2.1', () => {
    expect(hexToLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(hexToLuminance('#000000')).toBe(0);
    // Pure green contributes only its weighted channel.
    expect(hexToLuminance('#00FF00')).toBeCloseTo(0.7152, 4);
    // Below the sRGB threshold channels divide linearly by 12.92.
    expect(hexToLuminance('#050505')).toBeCloseTo((5 / 255) / 12.92, 5);
  });

  it('expands 3-digit shorthand to full channels', () => {
    expect(hexToLuminance('#FFF')).toBeCloseTo(1, 5);
    expect(hexToLuminance('#000')).toBe(0);
    expect(hexToLuminance('#0F0')).toBeCloseTo(0.7152, 4);
  });

  it.each(['#1234', '#1', '#1234567'])('rejects malformed hex %s', hex => {
    expect(() => hexToLuminance(hex)).toThrow('Invalid hex color');
  });
});

describe('getContrastRatio', () => {
  it('reports 21:1 for black on white with both AA levels passing', () => {
    expect(getContrastRatio('#000000', '#FFFFFF')).toEqual({
      ratio: 21,
      passesAA: true,
      passesAALarge: true,
    });
  });

  it('is symmetric in argument order and rounds to two decimals', () => {
    const a = getContrastRatio('#336699', '#F5F5F5');
    const b = getContrastRatio('#F5F5F5', '#336699');
    expect(a).toEqual(b);
    // Round-tripping through two decimals must be a fixed point.
    expect(a.ratio).toBe(Math.round(a.ratio * 100) / 100);
  });

  it('fails AA for normal text but keeps the large-text threshold reachable', () => {
    // #999999 on #FFFFFF is ~2.85:1 — below both thresholds.
    const dim = getContrastRatio('#999999', '#FFFFFF');
    expect(dim.passesAA).toBe(false);
    expect(dim.passesAALarge).toBe(false);
    // #767676 on #FFFFFF is ~4.54:1 — passes normal AA.
    const mid = getContrastRatio('#767676', '#FFFFFF');
    expect(mid.passesAA).toBe(true);
    expect(mid.passesAALarge).toBe(true);
  });
});

describe('validateThemeContrast', () => {
  it('returns no violations for an accessible palette', () => {
    expect(validateThemeContrast(accessibleTheme)).toEqual([]);
  });

  it('reports every failing pair with the observed ratio and requirement', () => {
    const violations = validateThemeContrast(crampedTheme);
    expect(violations.map(v => v.pair)).toEqual([
      'text/background',
      'textSecondary/background',
      'textSecondary/surface',
      'textTertiary/surface',
      'primary/background',
    ]);
    for (const violation of violations) {
      expect(violation.ratio).toBeLessThan(violation.required);
      expect(violation.ratio).toBeGreaterThanOrEqual(1);
    }
    // Normal-text pairs demand 4.5:1, tertiary/primary accents only 3:1.
    const byPair = new Map(violations.map(v => [v.pair, v]));
    expect(byPair.get('text/background')!.required).toBe(4.5);
    expect(byPair.get('textTertiary/surface')!.required).toBe(3);
    expect(byPair.get('text/background')).toMatchObject({
      foreground: crampedTheme.text,
      background: crampedTheme.background,
    });
  });
});
