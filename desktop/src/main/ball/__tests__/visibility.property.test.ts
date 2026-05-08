/**
 * isSufficientlyVisible 属性测试。
 *
 * 覆盖 Property: ensureVisible 的安全网
 *   - 完全在 workArea 内 → 一定 visible
 *   - 完全脱离所有 workArea → 一定不 visible
 *   - 刚好覆盖 minRatio 边界 → 不报错
 *
 * Validates: 需求 2.17（屏外纠偏）
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { isSufficientlyVisible, type WorkArea } from '../snap';

const BALL = { width: 80, height: 80 };

describe('isSufficientlyVisible', () => {
  it('窗口完全在某个 workArea 内 → visible', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (x, y) => {
          const workArea: WorkArea = { x: 0, y: 0, width: 1920, height: 1080 };
          // 夹到可视区内部
          const safeX = Math.min(x, 1920 - BALL.width);
          const safeY = Math.min(y, 1080 - BALL.height);
          expect(isSufficientlyVisible({ x: safeX, y: safeY }, BALL, [workArea], 0.5)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('窗口完全脱离所有 workArea → 不 visible', () => {
    const workArea: WorkArea = { x: 0, y: 0, width: 1920, height: 1080 };
    // 放到遥远的负数坐标
    expect(isSufficientlyVisible({ x: -10000, y: -10000 }, BALL, [workArea], 0.5)).toBe(false);
    expect(isSufficientlyVisible({ x: 99999, y: 99999 }, BALL, [workArea], 0.5)).toBe(false);
  });

  it('多个 workArea 中任一满足即可', () => {
    const areas: WorkArea[] = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 2000, y: 0, width: 1920, height: 1080 },
    ];
    // 位置只命中第二个显示器
    expect(isSufficientlyVisible({ x: 2010, y: 10 }, BALL, areas, 0.5)).toBe(true);
  });

  it('恰好 50% 面积在可用区 → 依照 >= 返回 true', () => {
    // Ball 80x80，刚好一半面积在 workArea 内：窗口左上角位于 (workArea.x - 40, workArea.y)
    const workArea: WorkArea = { x: 100, y: 100, width: 1000, height: 800 };
    const pos = { x: workArea.x - 40, y: workArea.y + 100 };
    // overlapX=40, overlapY=80, overlap=3200；ball area=6400；比例 0.5
    expect(isSufficientlyVisible(pos, BALL, [workArea], 0.5)).toBe(true);
  });

  it('完全不与 workArea 相交 → false', () => {
    const workArea: WorkArea = { x: 0, y: 0, width: 1000, height: 800 };
    expect(isSufficientlyVisible({ x: 2000, y: 2000 }, BALL, [workArea], 0.5)).toBe(false);
  });
});
