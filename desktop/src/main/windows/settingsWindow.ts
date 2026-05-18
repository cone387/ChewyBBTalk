/**
 * Settings 窗口：独立的设置弹窗。
 */
import { BrowserWindow, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

let settingsWindow: BrowserWindow | null = null;

const __dirname = dirname(fileURLToPath(import.meta.url));

const SETTINGS_WIDTH = 420;
const SETTINGS_HEIGHT = 300;

export function showSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  const primary = screen.getPrimaryDisplay();
  const wa = primary.workArea;
  const x = Math.round(wa.x + (wa.width - SETTINGS_WIDTH) / 2);
  const y = Math.round(wa.y + (wa.height - SETTINGS_HEIGHT) / 3);

  settingsWindow = new BrowserWindow({
    x,
    y,
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
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
