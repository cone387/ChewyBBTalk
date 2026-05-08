/**
 * Ball 窗口：全局置顶、透明、无边框，承载悬浮球 UI。
 */
import { BrowserWindow, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  BALL_WINDOW_SIZE,
  FIRST_RUN_OFFSET_BOTTOM,
  FIRST_RUN_OFFSET_RIGHT,
  MIN_VISIBLE_RATIO,
} from '../../shared/constants';
import { getBallState, setBallPosition } from '../store';
import { isSufficientlyVisible } from '../ball/snap';
import { animateSetPosition } from '../ball/animate';

let ballWindow: BrowserWindow | null = null;

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveInitialPosition(): { x: number; y: number; displayId: number } {
  const { position } = getBallState();
  const displays = screen.getAllDisplays();

  // 历史位置：若对应 display 仍在，且至少 50% 可见，直接还原
  if (position) {
    const display = displays.find((d) => d.id === position.displayId) ?? null;
    if (display) {
      const visible = isSufficientlyVisible(
        position,
        { width: BALL_WINDOW_SIZE, height: BALL_WINDOW_SIZE },
        displays.map((d) => d.workArea),
        MIN_VISIBLE_RATIO,
      );
      if (visible) return { x: position.x, y: position.y, displayId: display.id };
    }
  }

  // 首次启动 / 目标显示器不在：主屏右下角
  const primary = screen.getPrimaryDisplay();
  const { workArea } = primary;
  return {
    x: workArea.x + workArea.width - BALL_WINDOW_SIZE - FIRST_RUN_OFFSET_RIGHT,
    y: workArea.y + workArea.height - BALL_WINDOW_SIZE - FIRST_RUN_OFFSET_BOTTOM,
    displayId: primary.id,
  };
}

export function createBallWindow(): BrowserWindow {
  const { x, y, displayId } = resolveInitialPosition();

  ballWindow = new BrowserWindow({
    x,
    y,
    width: BALL_WINDOW_SIZE,
    height: BALL_WINDOW_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false, // 自己渲染阴影
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  ballWindow.setAlwaysOnTop(true, 'screen-saver');
  ballWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

  // Dev / Prod 加载
  if (process.env['ELECTRON_RENDERER_URL']) {
    // electron-vite 开发模式下，通过 ELECTRON_RENDERER_URL 提供 vite server 根路径
    // 四个 entry 分别是 /ball/ /compose/ 等，这里只加载 ball
    ballWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/ball/index.html`);
  } else {
    ballWindow.loadFile(resolve(__dirname, '../renderer/ball/index.html'));
  }

  // 记录初始位置（首次启动时 store 里位置为 null）
  setBallPosition(x, y, displayId);

  ballWindow.on('closed', () => {
    ballWindow = null;
  });

  return ballWindow;
}

export function getBallWindow(): BrowserWindow | null {
  return ballWindow;
}

export function animateBallTo(x: number, y: number): void {
  const win = ballWindow;
  if (!win || win.isDestroyed()) return;
  animateSetPosition(win, x, y);
}
