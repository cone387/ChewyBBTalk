/**
 * getMarkdownStyles 属性测试
 * Feature: mobile-v1.1-enhancements, Property 3: Markdown 样式主题适配一致性
 *
 * **Validates: Requirements 3.5, 3.6**
 */

import * as fc from 'fast-check';
import { getMarkdownStyles } from '../../src/utils/markdownStyles';
import type { ThemeColors } from '../../src/theme/ThemeContext';

// --- Generators ---

/** 生成随机 CSS 颜色字符串（hex 格式） */
const arbColor: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
  )
  .map(([r, g, b]) => `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);

/** 生成随机 ThemeColors 对象，所有字段为随机颜色字符串 */
const arbThemeColors: fc.Arbitrary<ThemeColors> = fc.record({
  background: arbColor,
  surface: arbColor,
  surfaceSecondary: arbColor,
  text: arbColor,
  textSecondary: arbColor,
  textTertiary: arbColor,
  border: arbColor,
  borderLight: arbColor,
  primary: arbColor,
  primaryLight: arbColor,
  accent: arbColor,
  danger: arbColor,
  dangerBg: arbColor,
  headerBg: arbColor,
  cardBg: arbColor,
  overlay: arbColor,
  fabShadow: arbColor,
  avatarBg: arbColor,
  lockBg: arbColor,
  lockAccent: arbColor,
});

// --- Property Tests ---

describe('getMarkdownStyles - Property 3: Markdown 样式主题适配一致性', () => {
  it('body.color 应等于输入的 colors.text', () => {
    fc.assert(
      fc.property(arbThemeColors, (colors) => {
        const styles = getMarkdownStyles(colors);
        expect(styles.body.color).toBe(colors.text);
      }),
      { numRuns: 100 },
    );
  });

  it('code_inline.backgroundColor 应等于输入的 colors.borderLight', () => {
    fc.assert(
      fc.property(arbThemeColors, (colors) => {
        const styles = getMarkdownStyles(colors);
        expect(styles.code_inline.backgroundColor).toBe(colors.borderLight);
      }),
      { numRuns: 100 },
    );
  });

  it('blockquote.borderLeftColor 应等于输入的 colors.border', () => {
    fc.assert(
      fc.property(arbThemeColors, (colors) => {
        const styles = getMarkdownStyles(colors);
        expect(styles.blockquote.borderLeftColor).toBe(colors.border);
      }),
      { numRuns: 100 },
    );
  });

  it('link.color 应等于输入的 colors.primary', () => {
    fc.assert(
      fc.property(arbThemeColors, (colors) => {
        const styles = getMarkdownStyles(colors);
        expect(styles.link.color).toBe(colors.primary);
      }),
      { numRuns: 100 },
    );
  });

  it('fence.backgroundColor 应等于输入的 colors.borderLight', () => {
    fc.assert(
      fc.property(arbThemeColors, (colors) => {
        const styles = getMarkdownStyles(colors);
        expect(styles.fence.backgroundColor).toBe(colors.borderLight);
      }),
      { numRuns: 100 },
    );
  });
});
