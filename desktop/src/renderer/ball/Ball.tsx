/**
 * Ball 组件（新架构）：
 *   - 渲染一个 position:absolute 的 div，用 transform 定位
 *   - 拖动改 transform，60fps 由 GPU 合成保证
 *   - 点透：鼠标进入 Ball 圆内 → setIgnoreMouseEvents(false)；离开 → true
 *   - 吸边：CSS transition + 根据 display.workArea 计算目标点
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OverlayInfo, DisplayInfo } from '../../shared/ipc-types';
import { BallMenu } from './BallMenu';

const BALL_DIAMETER = 56;
const DRAG_THRESHOLD_PX = 4;
const SNAP_EDGE_THRESHOLD_PX = 40;

type Edge = 'left' | 'right' | 'top' | 'bottom';

/** 根据当前 Ball 位置（overlay 坐标系）找它落在哪个 display */
function findDisplayForPoint(overlay: OverlayInfo, x: number, y: number): DisplayInfo | null {
  // 把 overlay 内坐标还原为屏幕坐标
  const sx = x + overlay.overlay.x;
  const sy = y + overlay.overlay.y;
  return (
    overlay.displays.find(
      (d) =>
        sx >= d.x &&
        sx < d.x + d.width &&
        sy >= d.y &&
        sy < d.y + d.height,
    ) ?? overlay.displays[0] ?? null
  );
}

/** 把一个在 overlay 坐标系的位置 clamp 到指定 display 的可见区内 */
function clampToDisplay(x: number, y: number, overlay: OverlayInfo, display: DisplayInfo) {
  // display.x/y 是屏幕坐标系；overlay.x 也是。先转 overlay 坐标系
  const minX = display.x - overlay.overlay.x;
  const minY = display.y - overlay.overlay.y;
  const maxX = minX + display.width - BALL_DIAMETER;
  const maxY = minY + display.height - BALL_DIAMETER;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

/** 判断并计算吸边目标点 */
function snapToEdge(
  x: number,
  y: number,
  overlay: OverlayInfo,
  display: DisplayInfo,
): { x: number; y: number; snapped: Edge | null } {
  const minX = display.x - overlay.overlay.x;
  const minY = display.y - overlay.overlay.y;
  const maxX = minX + display.width - BALL_DIAMETER;
  const maxY = minY + display.height - BALL_DIAMETER;

  const distances: Record<Edge, number> = {
    left: x - minX,
    right: maxX - x,
    top: y - minY,
    bottom: maxY - y,
  };

  const entries = Object.entries(distances) as [Edge, number][];
  entries.sort(([, a], [, b]) => a - b);
  const [edge, dist] = entries[0];

  if (dist >= SNAP_EDGE_THRESHOLD_PX) {
    // 未吸边，但仍 clamp 到可见区
    return { x: Math.max(minX, Math.min(maxX, x)), y: Math.max(minY, Math.min(maxY, y)), snapped: null };
  }

  // 吸边：让一半球体越出屏幕边缘，仅露出 28px
  const hide = BALL_DIAMETER / 2; // = 28
  switch (edge) {
    case 'left':
      return { x: minX - hide, y: Math.max(minY, Math.min(maxY, y)), snapped: 'left' };
    case 'right':
      return { x: maxX + hide, y: Math.max(minY, Math.min(maxY, y)), snapped: 'right' };
    case 'top':
      return { x: Math.max(minX, Math.min(maxX, x)), y: minY - hide, snapped: 'top' };
    case 'bottom':
      return { x: Math.max(minX, Math.min(maxX, x)), y: maxY + hide, snapped: 'bottom' };
  }
}

export function Ball() {
  const [overlayInfo, setOverlayInfo] = useState<OverlayInfo | null>(null);
  const [snapped, setSnapped] = useState<Edge | null>(null);
  const [ready, setReady] = useState(false);
  const [initialPos, setInitialPos] = useState<{ x: number; y: number } | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  const ballRef = useRef<HTMLDivElement>(null);
  // Ball 的"实际位置"（包含吸边隐藏），用于持久化与 snap 基准
  const posRef = useRef({ x: 0, y: 0 });
  // Ball 的"视觉位置"（hover 展开时与 posRef 不同），拖动起点用这个
  const visualPosRef = useRef({ x: 0, y: 0 });
  // 拖动状态
  const draggingRef = useRef(false);
  const pressedRef = useRef(false);
  const dragStartRef = useRef({ screenX: 0, screenY: 0, posX: 0, posY: 0 });
  const overlayInfoRef = useRef<OverlayInfo | null>(null);

  // 直接改 transform（不走 React state，60fps 无抖动）
  const applyTransform = useCallback((x: number, y: number, animate: boolean) => {
    const el = ballRef.current;
    if (!el) return;
    posRef.current = { x, y };
    visualPosRef.current = { x, y };
    if (animate) {
      el.classList.add('animating');
    } else {
      el.classList.remove('animating');
    }
    el.style.transform = `translate(${x}px, ${y}px)`;
  }, []);

  /** 只改 CSS 视觉位置（hover 展开/收回用），不改 posRef */
  const applyVisualOnly = useCallback((x: number, y: number, animate: boolean) => {
    const el = ballRef.current;
    if (!el) return;
    visualPosRef.current = { x, y };
    if (animate) el.classList.add('animating');
    else el.classList.remove('animating');
    el.style.transform = `translate(${x}px, ${y}px)`;
  }, []);

  // 初始化：拉 overlay 信息 + 计算起始位置（保存到 state，等 ball 渲染后再 apply）
  useEffect(() => {
    let disposed = false;

    const apply = (info: OverlayInfo) => {
      overlayInfoRef.current = info;
      setOverlayInfo(info);

      let startX: number;
      let startY: number;
      const primary = info.displays[0];
      if (info.savedPosition) {
        startX = info.savedPosition.x;
        startY = info.savedPosition.y;
      } else if (primary) {
        const minX = primary.x - info.overlay.x;
        const minY = primary.y - info.overlay.y;
        startX = minX + primary.width - BALL_DIAMETER - 24;
        startY = minY + primary.height - BALL_DIAMETER - 120;
      } else {
        startX = 100;
        startY = 100;
      }

      if (primary) {
        const clamped = clampToDisplay(startX, startY, info, primary);
        startX = clamped.x;
        startY = clamped.y;
      }

      posRef.current = { x: startX, y: startY };
      setInitialPos({ x: startX, y: startY });
      setReady(true);
    };

    window.desktop.ball.getOverlayInfo().then((info) => {
      if (disposed) return;
      apply(info);
    });

    const unsubscribe = window.desktop.ball.onOverlayInfo((info) => {
      if (disposed) return;
      apply(info);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  // Ball 渲染后应用初始 transform
  useEffect(() => {
    if (!ready || !initialPos) return;
    applyTransform(initialPos.x, initialPos.y, false);
  }, [ready, initialPos, applyTransform]);

  // 点透：鼠标进/出 Ball 实体区切换 ignoreMouseEvents + 吸边悬停展开
  useEffect(() => {
    if (!ready) return;
    let ignoring = true;
    let hoverTimer: number | null = null;
    window.desktop.ball.setIgnoreMouseEvents(true);

    const radius = BALL_DIAMETER / 2;
    // 吸边悬停检测区：比球半径大一圈，让鼠标靠近就能唤出
    const peekRadius = radius + 12;
    const PEEK_COLLAPSE_MS = 400;

    const check = (e: MouseEvent) => {
      if (draggingRef.current || pressedRef.current) return;

      // 点透判断基于"视觉位置"（球实际显示的位置）
      const { x: vx, y: vy } = visualPosRef.current;
      const cx = vx + radius;
      const cy = vy + radius;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const distSq = dx * dx + dy * dy;
      const inside = distSq <= radius * radius;
      const nearPeek = distSq <= peekRadius * peekRadius;

      if (inside && ignoring) {
        ignoring = false;
        window.desktop.ball.setIgnoreMouseEvents(false);
      } else if (!inside && !nearPeek && !ignoring) {
        // 只有完全离开 peek 范围才恢复 ignore
        ignoring = true;
        window.desktop.ball.setIgnoreMouseEvents(true);
      } else if (nearPeek && ignoring) {
        // 进入 peek 范围（半球露出区）就关掉 ignore，让 pointerdown 能直接触发
        ignoring = false;
        window.desktop.ball.setIgnoreMouseEvents(false);
      }

      // 吸边展开 / 收回逻辑
      const info = overlayInfoRef.current;
      if (!info) return;
      // 用"实际位置"判断是否处于隐藏态
      const { x: px, y: py } = posRef.current;
      const display = findDisplayForPoint(info, px + radius, py + radius);
      if (!display) return;
      const minX = display.x - info.overlay.x;
      const minY = display.y - info.overlay.y;
      const maxX = minX + display.width - BALL_DIAMETER;
      const maxY = minY + display.height - BALL_DIAMETER;
      const isHidden = px < minX || px > maxX || py < minY || py > maxY;

      if (!isHidden) return; // 未吸边 → 不用管展开

      if (nearPeek) {
        // 鼠标靠近 → 展开（改视觉位置到贴边可见）
        if (hoverTimer != null) {
          window.clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        const expX = Math.max(minX, Math.min(maxX, px));
        const expY = Math.max(minY, Math.min(maxY, py));
        if (visualPosRef.current.x !== expX || visualPosRef.current.y !== expY) {
          applyVisualOnly(expX, expY, true);
        }
      } else {
        // 鼠标离开一会后收回
        if (hoverTimer == null && (visualPosRef.current.x !== px || visualPosRef.current.y !== py)) {
          hoverTimer = window.setTimeout(() => {
            hoverTimer = null;
            applyVisualOnly(posRef.current.x, posRef.current.y, true);
          }, PEEK_COLLAPSE_MS);
        }
      }
    };

    window.addEventListener('mousemove', check);
    return () => {
      window.removeEventListener('mousemove', check);
      if (hoverTimer != null) window.clearTimeout(hoverTimer);
      window.desktop.ball.setIgnoreMouseEvents(false);
    };
  }, [ready, applyVisualOnly]);

  // 拖动处理
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();

      pressedRef.current = true;
      draggingRef.current = false;
      // 从"视觉位置"起步，按下时球在哪就从哪开始拖
      dragStartRef.current = {
        screenX: e.screenX,
        screenY: e.screenY,
        posX: visualPosRef.current.x,
        posY: visualPosRef.current.y,
      };

      const ballEl = ballRef.current;
      if (ballEl) {
        ballEl.classList.add('pressed');
        ballEl.classList.remove('animating');
      }

      const onMove = (ev: PointerEvent) => {
        if (!pressedRef.current) return;
        const dx = ev.screenX - dragStartRef.current.screenX;
        const dy = ev.screenY - dragStartRef.current.screenY;

        if (!draggingRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          draggingRef.current = true;
          ballEl?.classList.remove('pressed');
          ballEl?.classList.add('dragging');
          // 拖动期间清除 snap 状态
          setSnapped(null);
          ballEl?.classList.remove('snapped');
        }

        if (!draggingRef.current) return;

        const nextX = dragStartRef.current.posX + dx;
        const nextY = dragStartRef.current.posY + dy;

        // 拖动时也用 clamp：找 Ball 当前所在 display 约束边界
        const info = overlayInfoRef.current;
        if (info) {
          const display = findDisplayForPoint(info, nextX, nextY);
          if (display) {
            const clamped = clampToDisplay(nextX, nextY, info, display);
            applyTransform(clamped.x, clamped.y, false);
            return;
          }
        }
        applyTransform(nextX, nextY, false);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);

        const wasDragging = draggingRef.current;
        pressedRef.current = false;
        draggingRef.current = false;

        ballEl?.classList.remove('pressed', 'dragging');

        if (!wasDragging) {
          // 点击 → 切换菜单
          setMenuVisible((v) => !v);
          return;
        }

        // 吸边
        const info = overlayInfoRef.current;
        if (info) {
          const display = findDisplayForPoint(info, posRef.current.x, posRef.current.y);
          if (display) {
            const snap = snapToEdge(posRef.current.x, posRef.current.y, info, display);
            applyTransform(snap.x, snap.y, true);
            setSnapped(snap.snapped);
            if (snap.snapped) ballEl?.classList.add('snapped');
            else ballEl?.classList.remove('snapped');
            window.desktop.ball.savePosition(snap.x, snap.y);
            return;
          }
        }
        window.desktop.ball.savePosition(posRef.current.x, posRef.current.y);
      };

      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
    },
    [applyTransform],
  );

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // 双击直接打开 Compose
    setMenuVisible(false);
    window.desktop.compose.show();
  }, []);

  return (
    <div className="overlay">
      {ready && overlayInfo && (
        <>
          <div
            ref={ballRef}
            className={`ball ${snapped ? 'snapped' : ''}`}
            onPointerDown={onPointerDown}
            onDoubleClick={onDoubleClick}
            role="button"
            aria-label="ChewyBBTalk"
          >
            <svg className="ball-plus" viewBox="0 0 24 24">
              <line x1="12" y1="6" x2="12" y2="18" />
              <line x1="6" y1="12" x2="18" y2="12" />
            </svg>
          </div>
          <BallMenu
            visible={menuVisible}
            ballX={visualPosRef.current.x}
            ballY={visualPosRef.current.y}
            overlayWidth={overlayInfo.overlay.width}
            overlayHeight={overlayInfo.overlay.height}
            onClose={() => setMenuVisible(false)}
          />
        </>
      )}
    </div>
  );
}
