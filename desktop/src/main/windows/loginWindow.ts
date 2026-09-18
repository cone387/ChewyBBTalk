/**
 * Login 窗口：独立的登录弹窗。
 */
import { BrowserWindow } from 'electron';
import { initialWindowPosition, trackWindowPosition } from './windowPlacement';
import { suspendBallForWindow } from './ballWindow';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { appIconPath } from '../icons';
import { cancelBrowserLogin } from '../browserAuth';

let loginWindow: BrowserWindow | null = null;

const __dirname = dirname(fileURLToPath(import.meta.url));

const LOGIN_WIDTH = 340;
const LOGIN_HEIGHT = 510;

export function showLoginWindow(): void {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }

  const { x, y } = initialWindowPosition('login', LOGIN_WIDTH, LOGIN_HEIGHT);


  loginWindow = new BrowserWindow({
    x,
    y,
    width: LOGIN_WIDTH,
    height: LOGIN_HEIGHT,
    frame: false,
    transparent: true,
    ...(process.platform === 'win32' ? { thickFrame: false } : {}),
    resizable: false,
    alwaysOnTop: false,
    icon: appIconPath(),
    skipTaskbar: false,
    show: false,
    backgroundColor: '#00000000',
    roundedCorners: true,
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  trackWindowPosition(loginWindow, 'login');
  suspendBallForWindow(loginWindow);
  loginWindow.once('ready-to-show', () => {
    loginWindow?.show();
    loginWindow?.focus();
  });

  loginWindow.on('closed', () => {
    cancelBrowserLogin();
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
