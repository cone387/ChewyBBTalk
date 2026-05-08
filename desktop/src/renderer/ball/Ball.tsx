/**
 * Ball 组件：始终悬浮的圆形入口。
 *
 * M1 范围：
 *   - 渲染 56px 圆形按钮
 *   - 接入拖拽 hook，mousedown/move/up 全流程
 *   - 吸边状态由主进程广播的 ball:snap-state-changed 驱动 UI
 *   - 单击 / 双击 目前只打日志（Ball Menu / Compose 在后续 task）
 */
import { useEffect, useState } from 'react';
import { useBallDrag } from './useBallDrag';
import type { Edge } from '../../shared/constants';

export function Ball() {
  const [snapped, setSnapped] = useState<Edge | null>(null);

  useEffect(() => {
    // 订阅主进程吸边状态变化
    const unsubscribe = window.desktop.ball.onSnapStateChanged(setSnapped);
    return unsubscribe;
  }, []);

  const { onMouseDown, onDoubleClick } = useBallDrag({
    onClick: () => {
      // Task 2.7 Ball Menu 接入后换成 openMenu()
      console.info('[Ball] click (menu TBD)');
    },
    onDoubleClick: () => {
      // Task 4 Compose 接入后换成 openCompose()
      console.info('[Ball] double click (compose TBD)');
    },
  });

  return (
    <div className="ball-stage">
      <div
        className="ball"
        data-snapped={snapped ?? undefined}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        role="button"
        aria-label="ChewyBBTalk"
      >
        <svg className="ball-plus" viewBox="0 0 24 24">
          <line x1="12" y1="6" x2="12" y2="18" />
          <line x1="6" y1="12" x2="18" y2="12" />
        </svg>
      </div>
    </div>
  );
}
