/**
 * Ball 拖拽 hook（P0 重点：60fps 跟手）
 *
 * 工作原理：
 *   1. mousedown 记录 screenX/Y + 当前窗口位置（DIP）
 *   2. mousemove 只更新 latestOffset（不直接 IPC）
 *   3. 每一帧的 requestAnimationFrame 里，若 isDragging 则 IPC setPosition 一次
 *   4. mouseup 清理；移动 < 阈值视为"点击"，否则触发吸边
 */
import { useCallback, useEffect, useRef } from 'react';

const DRAG_THRESHOLD_PX = 4;

interface UseBallDragOptions {
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function useBallDrag(options: UseBallDragOptions = {}) {
  const rafRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const latestOffsetRef = useRef({ dx: 0, dy: 0 });
  const initialPosRef = useRef({ x: 0, y: 0 });
  const startScreenRef = useRef({ x: 0, y: 0 });
  const unsubRef = useRef<(() => void) | null>(null);

  // 清理挂在 document 上的监听
  useEffect(() => () => unsubRef.current?.(), []);

  const onMouseDown = useCallback(
    async (e: React.MouseEvent) => {
      // 只处理左键
      if (e.button !== 0) return;
      e.preventDefault();

      const initial = await window.desktop.ball.getPosition();
      initialPosRef.current = initial;
      startScreenRef.current = { x: e.screenX, y: e.screenY };
      latestOffsetRef.current = { dx: 0, dy: 0 };
      isDraggingRef.current = false;

      let moved = false;
      document.body.classList.add('ball-pressed');

      const flushRaf = () => {
        rafRef.current = null;
        if (!isDraggingRef.current) return;
        const { dx, dy } = latestOffsetRef.current;
        window.desktop.ball.setPosition(
          initialPosRef.current.x + dx,
          initialPosRef.current.y + dy,
        );
      };

      const onMove = (ev: MouseEvent) => {
        const dx = ev.screenX - startScreenRef.current.x;
        const dy = ev.screenY - startScreenRef.current.y;
        if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          moved = true;
          isDraggingRef.current = true;
          document.body.classList.remove('ball-pressed');
          document.body.classList.add('ball-dragging');
        }
        if (!isDraggingRef.current) return;
        latestOffsetRef.current = { dx, dy };
        if (rafRef.current == null) rafRef.current = requestAnimationFrame(flushRaf);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        unsubRef.current = null;

        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        document.body.classList.remove('ball-pressed');
        document.body.classList.remove('ball-dragging');

        if (!moved) {
          options.onClick?.();
          isDraggingRef.current = false;
          return;
        }

        isDraggingRef.current = false;
        // 释放后触发吸边；吸边动画在主进程里完成
        window.desktop.ball.snapToNearestEdge();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      unsubRef.current = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
    },
    [options],
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      options.onDoubleClick?.();
    },
    [options],
  );

  return { onMouseDown, onDoubleClick };
}
