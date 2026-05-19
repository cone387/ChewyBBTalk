// Feature: mobile-ui-appstore-ready, Property 4: Theme color contrast meets WCAG AA
import * as fc from 'fast-check';
import { validateThemeContrast, getContrastRatio, hexToLuminance } from '../../src/utils/contrastValidator';
import { THEMES } from '../../src/theme/ThemeContext';

describe('Property 4: Theme color contrast meets WCAG AA', () => {
  it('all 5 themes pass WCAG AA contrast requirements', () => {
    for (const theme of THEMES) {
      const violations = validateThemeContrast(theme.colors);
      if (violations.length > 0) {
        const details = violations.map(v => `${v.pair}: ${v.ratio}:1 (need ${v.required}:1)`).join(', ');
        fail(`Theme "${theme.name}" has contrast violations: ${details}`);
      }
    }
  });

  it('hexToLuminance returns values between 0 and 1 for valid hex colors', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (r, g, b) => {
          const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          const lum = hexToLuminance(hex);
          expect(lum).toBeGreaterThanOrEqual(0);
          expect(lum).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('contrast ratio is always >= 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (r1, g1, b1, r2, g2, b2) => {
          const hex1 = `#${r1.toString(16).padStart(2, '0')}${g1.toString(16).padStart(2, '0')}${b1.toString(16).padStart(2, '0')}`;
          const hex2 = `#${r2.toString(16).padStart(2, '0')}${g2.toString(16).padStart(2, '0')}${b2.toString(16).padStart(2, '0')}`;
          const result = getContrastRatio(hex1, hex2);
          expect(result.ratio).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('black on white has maximum contrast (21:1)', () => {
    const result = getContrastRatio('#000000', '#FFFFFF');
    expect(result.ratio).toBe(21);
    expect(result.passesAA).toBe(true);
    expect(result.passesAALarge).toBe(true);
  });

  it('same color has minimum contrast (1:1)', () => {
    const result = getContrastRatio('#808080', '#808080');
    expect(result.ratio).toBe(1);
    expect(result.passesAA).toBe(false);
  });
});
