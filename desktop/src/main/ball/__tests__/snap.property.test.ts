/**
 * Ball 吸边纯函数的属性测试。
 *
 * 覆盖属性：
 *   - Property 1: 吸边方向选择（requirements 2.11）
 *   - Property 5: 偏好吸附点收敛（requirements 2.20）
 *
 * 用 fast-check 生成随机 workArea + 窗口位置，逐条验证算法不变式。
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  clampToWorkArea,
  edgeDistances,
  extractAxisCoord,
  findPreferredSnap,
  learnSnapPoint,
  nearestEdge,
  shouldSnap,
  snapTargetPosition,
  type PreferredSnapPoint,
  type WorkArea,
} from '../snap';
import {
  SNAP_EDGE_THRESHOLD_PX,
  SNAP_PREFERRED_MIN_HITS,
  SNAP_PREFERRED_VARIANCE_PX,
  type Edge,
} from '../../../shared/constants';

// --- Arbitraries ---

const arbWorkArea: fc.Arbitrary<WorkArea> = fc.record({
  x: fc.integer({ min: 0, max: 2000 }),
  y: fc.integer({ min: 0, max: 2000 }),
  width: fc.integer({ min: 800, max: 4000 }),
  height: fc.integer({ min: 600, max: 3000 }),
});

const BALL_SIZE = { width: 80, height: 80 };

/** 生成一个窗口位置，保证落在 workArea 内（含越界微量） */
function arbPositionIn(workArea: WorkArea): fc.Arbitrary<{ x: number; y: number }> {
  return fc.record({
    x: fc.integer({
      min: workArea.x - BALL_SIZE.width,
      max: workArea.x + workArea.width,
    }),
    y: fc.integer({
      min: workArea.y - BALL_SIZE.height,
      max: workArea.y + workArea.height,
    }),
  });
}

const EDGES: Edge[] = ['left', 'right', 'top', 'bottom'];

// =========================================================================
// Property 1: 吸边方向选择
// =========================================================================
describe('Property 1: 吸边方向选择（需求 2.11）', () => {
  it('shouldSnap 成立当且仅当最近边距离 < SNAP_EDGE_THRESHOLD_PX', () => {
    fc.assert(
      fc.property(arbWorkArea, (workArea) => {
        return fc.assert(
          fc.property(arbPositionIn(workArea), (pos) => {
            const distances = edgeDistances(pos, BALL_SIZE, workArea);
            const near = nearestEdge(distances);
            expect(shouldSnap(distances)).toBe(near.distance < SNAP_EDGE_THRESHOLD_PX);
          }),
          { numRuns: 20 },
        );
      }),
      { numRuns: 20 },
    );
  });

  it('nearestEdge 返回的是四个距离中最小的那个', () => {
    fc.assert(
      fc.property(arbWorkArea, (workArea) => {
        return fc.assert(
          fc.property(arbPositionIn(workArea), (pos) => {
            const distances = edgeDistances(pos, BALL_SIZE, workArea);
            const near = nearestEdge(distances);
            const min = Math.min(...Object.values(distances));
            expect(near.distance).toBe(min);
          }),
          { numRuns: 20 },
        );
      }),
      { numRuns: 20 },
    );
  });

  it('四个距离之和 = workArea 可用宽度 + 可用高度 - 2 * 球尺寸（数学不变式）', () => {
    fc.assert(
      fc.property(arbWorkArea, arbPositionIn({ x: 0, y: 0, width: 3000, height: 2000 }), (workArea, pos) => {
        const distances = edgeDistances(pos, BALL_SIZE, workArea);
        const expected =
          workArea.width - BALL_SIZE.width + (workArea.height - BALL_SIZE.height);
        expect(distances.left + distances.right + distances.top + distances.bottom).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});

// =========================================================================
// Property 5: 偏好吸附点收敛
// =========================================================================
describe('Property 5: 偏好吸附点收敛（需求 2.20）', () => {
  const arbEdge = fc.constantFrom<Edge>(...EDGES);

  it('任意 edge + coord 的一次 learn 后，snapshot 长度 +1 或不变（合并）', () => {
    fc.assert(
      fc.property(arbEdge, fc.integer({ min: 0, max: 2000 }), (edge, coord) => {
        const before: PreferredSnapPoint[] = [];
        const after = learnSnapPoint(before, edge, coord);
        expect(after.length).toBe(1);
        expect(after[0]).toMatchObject({ edge, coord, hitCount: 1 });
      }),
      { numRuns: 200 },
    );
  });

  it('k≥3 次、方差<30px 的聚集 learn 后，findPreferredSnap 可命中', () => {
    fc.assert(
      fc.property(
        arbEdge,
        fc.integer({ min: 100, max: 1500 }),
        fc.integer({ min: SNAP_PREFERRED_MIN_HITS, max: 8 }),
        (edge, baseCoord, k) => {
          let pts: PreferredSnapPoint[] = [];
          for (let i = 0; i < k; i++) {
            // 在 baseCoord ± (VARIANCE-1) 范围内轻微抖动
            const jitter = (i - k / 2) % (SNAP_PREFERRED_VARIANCE_PX - 1);
            pts = learnSnapPoint(pts, edge, baseCoord + jitter, 1000 + i);
          }
          expect(pts.length).toBe(1);
          expect(pts[0].hitCount).toBe(k);

          const hit = findPreferredSnap(pts, edge, baseCoord);
          expect(hit).not.toBeNull();
          // 均值与 base 差值不超过抖动上限
          expect(Math.abs(hit!.coord - baseCoord)).toBeLessThan(SNAP_PREFERRED_VARIANCE_PX);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('hit 未满 MIN_HITS 时 findPreferredSnap 返回 null', () => {
    fc.assert(
      fc.property(arbEdge, fc.integer({ min: 0, max: 2000 }), (edge, coord) => {
        // 只 learn 1 次，hitCount = 1 < MIN_HITS
        const pts = learnSnapPoint([], edge, coord);
        const hit = findPreferredSnap(pts, edge, coord);
        expect(hit).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('远离既有偏好点（|Δ| >= VARIANCE_PX）时，learn 会新增一个点而非合并', () => {
    fc.assert(
      fc.property(
        arbEdge,
        fc.integer({ min: 200, max: 1000 }),
        (edge, baseCoord) => {
          let pts: PreferredSnapPoint[] = [];
          // 聚焦 base
          for (let i = 0; i < 3; i++) pts = learnSnapPoint(pts, edge, baseCoord);
          const farCoord = baseCoord + SNAP_PREFERRED_VARIANCE_PX + 50;
          const after = learnSnapPoint(pts, edge, farCoord);
          expect(after.length).toBe(2);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('不同 edge 上的 learn 不会合并', () => {
    let pts: PreferredSnapPoint[] = [];
    pts = learnSnapPoint(pts, 'left', 500);
    pts = learnSnapPoint(pts, 'right', 500);
    expect(pts.length).toBe(2);
    expect(pts.map((p) => p.edge).sort()).toEqual(['left', 'right']);
  });
});

// =========================================================================
// Property: extractAxisCoord 方向正确
// =========================================================================
describe('extractAxisCoord', () => {
  it('靠左/右 → 取 y；靠上/下 → 取 x', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 5000 }),
        fc.integer({ min: -1000, max: 5000 }),
        (x, y) => {
          expect(extractAxisCoord('left', { x, y })).toBe(y);
          expect(extractAxisCoord('right', { x, y })).toBe(y);
          expect(extractAxisCoord('top', { x, y })).toBe(x);
          expect(extractAxisCoord('bottom', { x, y })).toBe(x);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =========================================================================
// Property: snapTargetPosition + clampToWorkArea 不越界
// =========================================================================
describe('snapTargetPosition 不越界（Windows 透明窗口安全网）', () => {
  it('对任意边和任意 axisCoord，吸边结果都在 workArea 可见区内', () => {
    fc.assert(
      fc.property(
        arbWorkArea,
        fc.constantFrom<Edge>(...EDGES),
        fc.integer({ min: -5000, max: 10000 }),
        (workArea, edge, axisCoord) => {
          const snap = snapTargetPosition(edge, axisCoord, workArea, BALL_SIZE);
          expect(snap.x).toBeGreaterThanOrEqual(workArea.x);
          expect(snap.y).toBeGreaterThanOrEqual(workArea.y);
          expect(snap.x + BALL_SIZE.width).toBeLessThanOrEqual(workArea.x + workArea.width);
          expect(snap.y + BALL_SIZE.height).toBeLessThanOrEqual(workArea.y + workArea.height);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('clampToWorkArea 拖动保护', () => {
  it('任意输入位置 → 输出一定在 workArea 内且窗口不越界', () => {
    fc.assert(
      fc.property(
        arbWorkArea,
        fc.integer({ min: -10000, max: 10000 }),
        fc.integer({ min: -10000, max: 10000 }),
        (workArea, x, y) => {
          const res = clampToWorkArea({ x, y }, BALL_SIZE, workArea);
          expect(res.x).toBeGreaterThanOrEqual(workArea.x);
          expect(res.y).toBeGreaterThanOrEqual(workArea.y);
          expect(res.x + BALL_SIZE.width).toBeLessThanOrEqual(workArea.x + workArea.width);
          expect(res.y + BALL_SIZE.height).toBeLessThanOrEqual(workArea.y + workArea.height);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('已经在 workArea 内的位置不被改变', () => {
    const workArea = { x: 100, y: 100, width: 1920, height: 1080 };
    const pos = { x: 500, y: 500 };
    expect(clampToWorkArea(pos, BALL_SIZE, workArea)).toEqual(pos);
  });
});
