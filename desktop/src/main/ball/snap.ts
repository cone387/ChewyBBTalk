/**
 * Ball 吸边与偏好吸附点算法（纯函数，可在 Node 环境下属性测试）
 *
 * 不依赖 Electron runtime，BrowserWindow / Screen 的调用留给 ballWindow.ts。
 */
import {
  type Edge,
  SNAP_EDGE_THRESHOLD_PX,
  SNAP_PREFERRED_MIN_HITS,
  SNAP_PREFERRED_VARIANCE_PX,
} from '../../shared/constants';

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreferredSnapPoint {
  edge: Edge;
  /** 另一轴坐标：edge ∈ {left,right} 时记 y；{top,bottom} 时记 x */
  coord: number;
  hitCount: number;
  lastUsedAt: number;
}

/**
 * 计算 Ball 距四条边的距离（基于窗口左上角位置）。
 * workArea 是当前显示器可用区（排除任务栏 / Dock）。
 * size 是 Ball 窗口尺寸。
 */
export function edgeDistances(
  position: { x: number; y: number },
  size: { width: number; height: number },
  workArea: WorkArea,
): Record<Edge, number> {
  const rightEdge = workArea.x + workArea.width - size.width;
  const bottomEdge = workArea.y + workArea.height - size.height;
  return {
    left: position.x - workArea.x,
    right: rightEdge - position.x,
    top: position.y - workArea.y,
    bottom: bottomEdge - position.y,
  };
}

/**
 * 选出最近边及其距离。
 */
export function nearestEdge(distances: Record<Edge, number>): { edge: Edge; distance: number } {
  const entries = Object.entries(distances) as [Edge, number][];
  entries.sort(([, a], [, b]) => a - b);
  return { edge: entries[0][0], distance: entries[0][1] };
}

/**
 * 判断应否吸附：最近边距离 < SNAP_EDGE_THRESHOLD_PX。
 */
export function shouldSnap(distances: Record<Edge, number>): boolean {
  return nearestEdge(distances).distance < SNAP_EDGE_THRESHOLD_PX;
}

/**
 * 计算吸边后的目标位置。
 * 首版不让窗口越界（Windows 透明窗口跨屏有 GPU 合成 bug，会整窗消失）。
 * 吸边后窗口紧贴屏幕边缘，Ball 保持完整可见，通过渲染侧 CSS 降低 opacity 做"可拉出"提示。
 *
 * @param edge         目标边
 * @param axisCoord    另一轴要落到的坐标（用户释放时的原始坐标 or 偏好吸附点）
 * @param workArea     当前显示器可用区
 * @param size         Ball 窗口尺寸
 */
export function snapTargetPosition(
  edge: Edge,
  axisCoord: number,
  workArea: WorkArea,
  size: { width: number; height: number },
): { x: number; y: number } {
  const rightEdge = workArea.x + workArea.width - size.width;
  const bottomEdge = workArea.y + workArea.height - size.height;
  switch (edge) {
    case 'left':
      return { x: workArea.x, y: clamp(axisCoord, workArea.y, bottomEdge) };
    case 'right':
      return { x: rightEdge, y: clamp(axisCoord, workArea.y, bottomEdge) };
    case 'top':
      return { x: clamp(axisCoord, workArea.x, rightEdge), y: workArea.y };
    case 'bottom':
      return { x: clamp(axisCoord, workArea.x, rightEdge), y: bottomEdge };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 把任意位置 clamp 到 workArea 可见区（窗口始终完整在屏内）。
 * 用于拖动过程中保护 Ball 不跑丢。
 */
export function clampToWorkArea(
  position: { x: number; y: number },
  size: { width: number; height: number },
  workArea: WorkArea,
): { x: number; y: number } {
  return {
    x: clamp(position.x, workArea.x, workArea.x + workArea.width - size.width),
    y: clamp(position.y, workArea.y, workArea.y + workArea.height - size.height),
  };
}

/**
 * 从"当前位置 + 目标边"取另一轴坐标。
 * 靠左右 → 用 y；靠上下 → 用 x。
 */
export function extractAxisCoord(
  edge: Edge,
  position: { x: number; y: number },
): number {
  return edge === 'left' || edge === 'right' ? position.y : position.x;
}

/**
 * 查询现有偏好点中，最接近给定 axisCoord 且达到 MIN_HITS 的点。
 * 没有 → 返回 null（降级使用原始 axisCoord）。
 */
export function findPreferredSnap(
  points: readonly PreferredSnapPoint[],
  edge: Edge,
  axisCoord: number,
): PreferredSnapPoint | null {
  // 邻域 = 阈值 + 聚类方差，避免刚好在边界时反复错过
  const neighborhood = SNAP_EDGE_THRESHOLD_PX;
  let best: PreferredSnapPoint | null = null;
  for (const p of points) {
    if (p.edge !== edge) continue;
    if (p.hitCount < SNAP_PREFERRED_MIN_HITS) continue;
    if (Math.abs(p.coord - axisCoord) > neighborhood) continue;
    if (!best || p.hitCount > best.hitCount) best = p;
  }
  return best;
}

/**
 * 更新偏好点集合：
 *   - 若邻域内存在相同 edge 的点（|Δ| < VARIANCE_PX），hitCount++，coord 平滑到均值。
 *   - 否则新增一个 hitCount=1 的点。
 *
 * 返回新的 points 数组（不修改入参，属性测试友好）。
 */
export function learnSnapPoint(
  points: readonly PreferredSnapPoint[],
  edge: Edge,
  axisCoord: number,
  now: number = Date.now(),
): PreferredSnapPoint[] {
  const next: PreferredSnapPoint[] = [];
  let merged = false;
  for (const p of points) {
    if (!merged && p.edge === edge && Math.abs(p.coord - axisCoord) < SNAP_PREFERRED_VARIANCE_PX) {
      // 指数移动平均：新坐标权重更高可以适应用户微调，但不要太激进
      const newCount = p.hitCount + 1;
      next.push({
        edge: p.edge,
        coord: (p.coord * p.hitCount + axisCoord) / newCount,
        hitCount: newCount,
        lastUsedAt: now,
      });
      merged = true;
    } else {
      next.push(p);
    }
  }
  if (!merged) {
    next.push({ edge, coord: axisCoord, hitCount: 1, lastUsedAt: now });
  }
  return next;
}

/**
 * 判断窗口在所有显示器 workArea 集合下是否"可见"：
 * 至少有一个显示器的可用区能看到窗口面积的 MIN_VISIBLE_RATIO 以上。
 */
export function isSufficientlyVisible(
  position: { x: number; y: number },
  size: { width: number; height: number },
  workAreas: readonly WorkArea[],
  minRatio: number,
): boolean {
  const winArea = size.width * size.height;
  for (const wa of workAreas) {
    const overlapX = Math.max(0, Math.min(position.x + size.width, wa.x + wa.width) - Math.max(position.x, wa.x));
    const overlapY = Math.max(0, Math.min(position.y + size.height, wa.y + wa.height) - Math.max(position.y, wa.y));
    if ((overlapX * overlapY) / winArea >= minRatio) return true;
  }
  return false;
}
