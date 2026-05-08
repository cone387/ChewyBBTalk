/**
 * 窗口位置的 spring 动画。
 *
 * 为什么不用 Electron 自带 setPosition(x, y, animate=true)？
 *   - Windows 下有已知卡顿 bug（丢帧、跳变）
 *   - 无法中途取消
 *   - 参数不可调
 *
 * 这里用 setInterval(16ms) 推进，参数对齐 React Spring 默认 (tension=180, friction=22)。
 */
import type { BrowserWindow } from 'electron';

interface SpringOptions {
  tension: number;
  friction: number;
  /** 速度小于该阈值且距离 < 0.5px 时视为到达 */
  restVelocity: number;
  restDisplacement: number;
}

const DEFAULT_OPTS: SpringOptions = {
  tension: 180,
  friction: 22,
  restVelocity: 0.5,
  restDisplacement: 0.5,
};

export interface AnimateHandle {
  cancel(): void;
  done: Promise<void>;
}

/**
 * 用 spring 动画把窗口移动到 (targetX, targetY)。
 * 调用时会取消该窗口上一次未完成的 animate。
 */
export function animateSetPosition(
  win: BrowserWindow,
  targetX: number,
  targetY: number,
  opts: Partial<SpringOptions> = {},
): AnimateHandle {
  const o = { ...DEFAULT_OPTS, ...opts };
  const [startX, startY] = win.getPosition();
  let x = startX;
  let y = startY;
  let vx = 0;
  let vy = 0;
  let cancelled = false;

  const step = 1 / 60; // 60fps

  const handle: AnimateHandle = {
    cancel() {
      cancelled = true;
    },
    done: new Promise<void>((resolve) => {
      const tick = () => {
        if (cancelled || win.isDestroyed()) {
          resolve();
          return;
        }

        // Spring 物理：F = -tension * x - friction * v
        const fx = -o.tension * (x - targetX) - o.friction * vx;
        const fy = -o.tension * (y - targetY) - o.friction * vy;
        vx += fx * step;
        vy += fy * step;
        x += vx * step;
        y += vy * step;

        const atRestX = Math.abs(vx) < o.restVelocity && Math.abs(x - targetX) < o.restDisplacement;
        const atRestY = Math.abs(vy) < o.restVelocity && Math.abs(y - targetY) < o.restDisplacement;

        if (atRestX && atRestY) {
          win.setPosition(Math.round(targetX), Math.round(targetY), false);
          resolve();
          return;
        }

        win.setPosition(Math.round(x), Math.round(y), false);
        setTimeout(tick, 16);
      };
      tick();
    }),
  };

  return handle;
}
