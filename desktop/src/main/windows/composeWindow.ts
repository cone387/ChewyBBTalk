/**
 * Compose 窗口：每次打开都重新创建（销毁式），彻底避免 Windows DPI 缩小 bug。
 * 草稿通过 electron-store 持久化。
 */
import { BrowserWindow, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

let composeWindow: BrowserWindow | null = null;

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_WIDTH = 440;
const DEFAULT_HEIGHT = 160;

function createComposeWindow(ballScreenX?: number, ballScreenY?: number): BrowserWindow {
  if (composeWindow && !composeWindow.isDestroyed()) {
    composeWindow.destroy();
    composeWindow = null;
  }

  const primary = screen.getPrimaryDisplay();
  const wa = primary.workArea;
  let x: number, y: number;

  if (typeof ballScreenX === 'number' && typeof ballScreenY === 'number') {
    // 智能选角：优先左上，空间不够则其他角
    x = ballScreenX - DEFAULT_WIDTH - 12;
    y = ballScreenY - DEFAULT_HEIGHT - 12;

    // 左上不够 → 右上
    if (x < wa.x) {
      x = ballScreenX + 68;
    }
    // 上面不够 → 下面
    if (y < wa.y) {
      y = ballScreenY + 68;
    }
    // 右边溢出 → 拉回
    if (x + DEFAULT_WIDTH > wa.x + wa.width) {
      x = wa.x + wa.width - DEFAULT_WIDTH - 8;
    }
    // 下面溢出 → 拉回
    if (y + DEFAULT_HEIGHT > wa.y + wa.height) {
      y = wa.y + wa.height - DEFAULT_HEIGHT - 8;
    }
  } else {
    x = Math.round(wa.x + (wa.width - DEFAULT_WIDTH) / 2);
    y = Math.round(wa.y + (wa.height - DEFAULT_HEIGHT) / 3);
  }

  composeWindow = new BrowserWindow({
    x,
    y,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minHeight: 160,
    maxHeight: 500,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#FFFFFF',
    roundedCorners: true,
    ...(process.platform === 'darwin' ? { vibrancy: 'hud' as const } : {}),
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  composeWindow.once('ready-to-show', () => {
    composeWindow?.show();
    composeWindow?.focus();
  });

  // 关闭 = 销毁
  composeWindow.on('closed', () => {
    composeWindow = null;
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    composeWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/compose/index.html`);
  } else {
    composeWindow.loadFile(resolve(__dirname, '../renderer/compose/index.html'));
  }

  return composeWindow;
}

/** 显示 Compose（每次重新创建） */
export function showComposeWindow(ballScreenX?: number, ballScreenY?: number): void {
  createComposeWindow(ballScreenX, ballScreenY);
}

/** 关闭（销毁）Compose */
export function hideComposeWindow(): void {
  if (composeWindow && !composeWindow.isDestroyed()) {
    composeWindow.destroy();
    composeWindow = null;
  }
}

/** Compose 是否正在显示 */
export function isComposeVisible(): boolean {
  return composeWindow !== null && !composeWindow.isDestroyed() && composeWindow.isVisible();
}

export function getComposeWindow(): BrowserWindow | null {
  return composeWindow;
}

/** Smoothly resize the compose window to the target dimensions. */
export function resizeComposeWindow(width: number, height: number): void {
  if (!composeWindow || composeWindow.isDestroyed()) return;

  const [currentW, currentH] = composeWindow.getSize();
  if (currentW === width && currentH === height) return;

  if (process.platform === 'darwin') {
    // macOS supports animated resize natively
    composeWindow.setSize(width, height, true);
  } else {
    // Windows/Linux: step-based animation over ~150ms
    const steps = 8;
    const dw = (width - currentW) / steps;
    const dh = (height - currentH) / steps;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step >= steps || !composeWindow || composeWindow.isDestroyed()) {
        clearInterval(interval);
        if (composeWindow && !composeWindow.isDestroyed()) {
          composeWindow.setSize(width, height);
        }
        return;
      }
      const w = Math.round(currentW + dw * step);
      const h = Math.round(currentH + dh * step);
      composeWindow!.setSize(w, h);
    }, 18);
  }
}
