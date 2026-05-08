/**
 * Ball / Compose 视觉与交互常量。
 * 主进程 / 渲染进程 / 测试共用。
 */

// Ball 窗口尺寸（含阴影缓冲区；真正可视直径为 56px）
export const BALL_WINDOW_SIZE = 80;
export const BALL_DIAMETER = 56;

// 拖拽相关
export const DRAG_THRESHOLD_PX = 4;

// 吸边
export const SNAP_EDGE_THRESHOLD_PX = 40;
export const SNAP_HIDDEN_OFFSET_PX = 28; // 吸边后隐藏一半：中心越界 28px

// 偏好吸附点
export const SNAP_PREFERRED_VARIANCE_PX = 30;   // 同一位置聚类阈值
export const SNAP_PREFERRED_MIN_HITS = 3;       // 升级为偏好点所需的 hit 次数

// 首次启动位置（距主屏右下角 24 / 120）
export const FIRST_RUN_OFFSET_RIGHT = 24;
export const FIRST_RUN_OFFSET_BOTTOM = 120;

// ensureVisible 的最小可见比例
export const MIN_VISIBLE_RATIO = 0.5;

// 动画时长
export const SNAP_ANIMATION_MS = 300;

// Ball 默认主色（与 App/Web 默认蓝主题一致）
export const BALL_COLOR = '#3B82F6';

export type Edge = 'left' | 'right' | 'top' | 'bottom';
