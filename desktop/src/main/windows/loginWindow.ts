/**
 * Login 窗口：独立的登录弹窗。
 */
import { BrowserWindow, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

let loginWindow: BrowserWindow | null = null;

const __dirname = dirname(fileURLToPath(import.meta.url));

const LOGIN_WIDTH = 340;
const LOGIN_HEIGHT = 360;

export function showLoginWindow(): void {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }

  const primary = screen.getPrimaryDisplay();
  const wa = primary.workArea;
  const x = Math.round(wa.x + (wa.width - LOGIN_WIDTH) / 2);
  const y = Math.round(wa.y + (wa.height - LOGIN_HEIGHT) / 3);

  loginWindow = new BrowserWindow({
    x,
    y,
    width: LOGIN_WIDTH,
    height: LOGIN_HEIGHT,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#FFFFFF',
    roundedCorners: true,
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  loginWindow.once('ready-to-show', () => {
    loginWindow?.show();
    loginWindow?.focus();
  });

  loginWindow.on('closed', () => {
    loginWindow = null;
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    loginWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/login/index.html`);
  } else {
    loginWindow.loadFile(resolve(__dirname, '../renderer/login/index.html'));
  }
}

export function hideLoginWindow(): void {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.destroy();
    loginWindow = null;
  }
}
