/**
 * Settings 窗口：独立的设置弹窗。
 */
import { BrowserWindow } from 'electron';
import { initialWindowPosition, trackWindowPosition } from './windowPlacement';
import { suspendBallForWindow } from './ballWindow';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { appIconPath } from '../icons';

let settingsWindow: BrowserWindow | null = null;

const __dirname = dirname(fileURLToPath(import.meta.url));

const SETTINGS_WIDTH = 420;
const SETTINGS_HEIGHT = 380;

export function showSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  const { x, y } = initialWindowPosition('settings', SETTINGS_WIDTH, SETTINGS_HEIGHT);


  settingsWindow = new BrowserWindow({
    x,
    y,
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
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

  trackWindowPosition(settingsWindow, 'settings');
  suspendBallForWindow(settingsWindow);
  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show();
    settingsWindow?.focus();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings/index.html`);
  } else {
    settingsWindow.loadFile(resolve(__dirname, '../renderer/settings/index.html'));
  }
}

export function hideSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.destroy();
    settingsWindow = null;
  }
}
