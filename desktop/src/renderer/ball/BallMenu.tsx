/**
 * Ball 点击后弹出的菜单。
 * 三项：新建 / 打开 Web / 设置（设置暂时 no-op）
 */
import { useCallback, useEffect, useRef } from 'react';

interface BallMenuProps {
  visible: boolean;
  /** Ball 当前视觉位置（overlay 坐标系） */
  ballX: number;
  ballY: number;
  /** overlay 尺寸 */
  overlayWidth: number;
  overlayHeight: number;
  onClose: () => void;
}

const MENU_WIDTH = 140;
const MENU_ITEM_HEIGHT = 36;
const BALL_SIZE = 56;
const GAP = 8;

const items = [
  { id: 'compose', label: '✏️ 新建', action: () => window.desktop.compose.show() },
  { id: 'web', label: '🌐 打开 Web', action: () => window.desktop.shell.openExternal('https://bbtalk.cone387.top') },
  { id: 'settings', label: '⚙️ 设置', action: () => console.info('[Menu] settings TBD') },
];

export function BallMenu({ visible, ballX, ballY, overlayWidth, overlayHeight, onClose }: BallMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击菜单外关闭
  useEffect(() => {
    if (!visible) return;
    const handler = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 延迟一帧再绑定，避免打开菜单的那次 click 立刻触发关闭
    requestAnimationFrame(() => {
      window.addEventListener('pointerdown', handler, true);
    });
    return () => window.removeEventListener('pointerdown', handler, true);
  }, [visible, onClose]);

  // Esc 关闭
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  const handleItemClick = useCallback(
    (action: () => void) => {
      action();
      onClose();
    },
    [onClose],
  );

  if (!visible) return null;

  // 计算菜单位置：默认在 Ball 右侧，空间不够则左侧
  const menuHeight = items.length * MENU_ITEM_HEIGHT + 8;
  let left = ballX + BALL_SIZE + GAP;
  let top = ballY + (BALL_SIZE - menuHeight) / 2;

  // 右侧空间不够 → 放左边
  if (left + MENU_WIDTH > overlayWidth) {
    left = ballX - MENU_WIDTH - GAP;
  }
  // 上下越界修正
  if (top < 8) top = 8;
  if (top + menuHeight > overlayHeight - 8) top = overlayHeight - menuHeight - 8;

  return (
    <div
      ref={menuRef}
      className="ball-menu"
      style={{ left, top, width: MENU_WIDTH }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          className="ball-menu-item"
          onClick={() => handleItemClick(item.action)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
