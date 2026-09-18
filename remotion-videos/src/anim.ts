import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TIMING } from './theme';

/** Spring 预设：柔和 / 灵敏 / 弹跳 / 厚重 */
export const SPRING = {
  smooth: { damping: 100, stiffness: 200 },
  snappy: { damping: 200, stiffness: 400 },
  bouncy: { damping: 50, stiffness: 300 },
  heavy: { damping: 120, stiffness: 120, mass: 2 },
} as const;

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const;

/** 线性区间映射（默认 clamp） */
export const range = (
  frame: number,
  input: [number, number],
  output: [number, number],
) => interpolate(frame, input, output, clamp);

/**
 * 场景透明度。
 *
 * 交叉溶解的正确做法：**下层保持完全不透明，上层淡入**。
 * 若两层同时做淡出+淡入，重叠区会出现亮度塌陷（合成后 alpha 只有 0.75）。
 * 因此这里默认只做淡入，只有需要收尾的场景才传 fadeOut。
 */
export const sceneOpacity = (
  frame: number,
  duration: number,
  fadeIn = TIMING.overlap,
  fadeOut = 0,
) => {
  const entering = range(frame, [0, fadeIn], [0, 1]);
  const leaving = fadeOut > 0 ? range(frame, [duration - fadeOut, duration], [1, 0]) : 1;
  return Math.min(entering, leaving);
};

/** 淡入 + 上移（最常用的入场动画） */
export const fadeSlideUp = (
  frame: number,
  start: number,
  duration = 20,
  distance = 28,
) => ({
  opacity: range(frame, [start, start + duration], [0, 1]),
  transform: `translateY(${range(
    frame,
    [start, start + duration + 6],
    [distance, 0],
  )}px)`,
});

/** 淡入 + 从左侧滑入 */
export const fadeSlideRight = (
  frame: number,
  start: number,
  duration = 20,
  distance = 36,
) => ({
  opacity: range(frame, [start, start + duration], [0, 1]),
  transform: `translateX(${range(
    frame,
    [start, start + duration + 6],
    [-distance, 0],
  )}px)`,
});

/** 逐项交错入场（列表 / 卡片网格） */
export const staggerItem = (
  frame: number,
  index: number,
  gap = 8,
  duration = 18,
  distance = 40,
) => {
  const start = index * gap;
  return {
    opacity: range(frame, [start, start + duration], [0, 1]),
    transform: `translateY(${range(
      frame,
      [start, start + duration + 8],
      [distance, 0],
    )}px)`,
  };
};

/** 弹簧缩放登场 */
export const springScale = (
  frame: number,
  fps: number,
  delay = 0,
  config: Parameters<typeof spring>[0]['config'] = SPRING.smooth,
) =>
  spring({
    frame: frame - delay,
    fps,
    config,
    durationInFrames: undefined,
  });

/** 打字机：逐字显示 */
export const typewriter = (frame: number, text: string, framesPerChar = 1.1) => {
  const chars = Math.max(0, Math.floor(frame / framesPerChar));
  return text.slice(0, Math.min(chars, text.length));
};

/** 光标：平滑呼吸式闪烁（不用 Math.round 硬跳） */
export const cursorOpacity = (frame: number) =>
  interpolate(Math.sin(frame * 0.18), [-1, 1], [0.15, 1]);

/** 数字滚动 */
export const countUp = (
  frame: number,
  target: number,
  start: number,
  duration: number,
) => Math.floor(target * range(frame, [start, start + duration], [0, 1]));

/** 缓慢漂浮（用于背景光斑，营造呼吸感） */
export const float = (frame: number, amplitude = 18, period = 150, phase = 0) =>
  Math.sin((frame / period) * Math.PI * 2 + phase) * amplitude;

/** 便捷 hook：一次性拿到 frame / fps */
export const useAnim = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  return { frame, fps, durationInFrames, width, height };
};
