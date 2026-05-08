/**
 * Compose 窗口：小巧精致的编辑窗口。
 *
 * - 440×300 起步，无边框 + 圆角 + 阴影
 * - 始终置顶
 * - 关闭 = 隐藏（不销毁，保留 renderer 便于秒开）
 * - macOS vibrancy / Windows acrylic
 */
import { BrowserWindow, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

let composeWindow: BrowserWindow | null = null;

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_WIDTH = 440;
const DEFAULT_HEIGHT = 300;

export function createComposeWindow(): BrowserWindow {
  if (composeWindow && !composeWindow.isDestroyed()) {
    composeWindow.show();
    composeWindow.focus();
    return composeWindow;
  }

  const primary = screen.getPrimaryDisplay();
  const wa = primary.workArea;
  // 居中偏上
  const x = Math.round(wa.x + (wa.width - DEFAULT_WIDTH) / 2);
  const y = Math.round(wa.y + (wa.height - DEFAULT_HEIGHT) / 3);

  composeWindow = new BrowserWindow({
    x,
    y,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: DEFAULT_WIDTH,
    minHeight: 200,
    maxWidth: DEFAULT_WIDTH,
    maxHeight: 600,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#FFFFFF',
    roundedCorners: true,
    ...(process.platform === 'darwin' ? { vibrancy: 'hud' as const } : {}),
    ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : {}),
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

  // 关闭 = 隐藏
  composeWindow.on('close', (e) => {
    e.preventDefault();
    composeWindow?.hide();
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    composeWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/compose/index.html`);
  } else {
    composeWindow.loadFile(resolve(__dirname, '../renderer/compose/index.html'));
  }

  return composeWindow;
}

export function showComposeWindow(): void {
  if (composeWindow && !composeWindow.isDestroyed()) {
    composeWindow.show();
    composeWindow.focus();
  } else {
    createComposeWindow();
  }
}

export function hideComposeWindow(): void {
  if (composeWindow && !composeWindow.isDestroyed()) {
    composeWindow.hide();
  }
}

export function getComposeWindow(): BrowserWindow | null {
  return composeWindow;
}
