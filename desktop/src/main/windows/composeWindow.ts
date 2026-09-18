/**
 * Compose 窗口：关闭时保存草稿并销毁，重复打开仅聚焦。
 * 草稿通过 electron-store 持久化。
 */
import { BrowserWindow, screen, ipcMain, dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import { store } from '../store';
import { appIconPath } from '../icons';
import { composePosition } from './placement';
import { initialWindowPosition, trackWindowPosition, shouldCenterWindow } from './windowPlacement';
import { suspendBallForWindow } from './ballWindow';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

let composeWindow: BrowserWindow | null = null;


const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_WIDTH = 440;
const DEFAULT_HEIGHT = 160;

function createComposeWindow(ballScreenX?: number, ballScreenY?: number): BrowserWindow {
  if (composeWindow && !composeWindow.isDestroyed()) {
    composeWindow.show(); composeWindow.focus(); composeWindow.webContents.focus();
    composeWindow.webContents.send('compose:focus-input');
    return composeWindow;
  }

  const { x, y } = initialWindowPosition('compose', DEFAULT_WIDTH, DEFAULT_HEIGHT);

  composeWindow = new BrowserWindow({
    x,
    y,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minHeight: 160,
    maxHeight: 500,
    frame: false,
    // Avoid invisible frame insets changing bounds during programmatic resize on Windows.
    ...(process.platform === 'win32' ? { thickFrame: false } : {}),
    transparent: true,
    resizable: false,
    alwaysOnTop: store.get('compose.pinned') ?? false,
    icon: appIconPath(),
    skipTaskbar: false,
    show: false,
    backgroundColor: '#00000000',
    roundedCorners: true,
    ...(process.platform === 'darwin' ? { vibrancy: 'hud' as const } : {}),
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  trackWindowPosition(composeWindow, 'compose');
  suspendBallForWindow(composeWindow);
  composeWindow.once('ready-to-show', () => {
    composeWindow?.show();
    composeWindow?.focus();
    composeWindow?.webContents.focus();
    composeWindow?.webContents.send('compose:focus-input');
  });

  composeWindow.on('close', event => {
    event.preventDefault();
    hideComposeWindow();
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
  const win = composeWindow;
  if (!win || win.isDestroyed() || closing) return;
  closing = true;
  const id = randomUUID();
  const cleanup = () => { clearTimeout(timer); ipcMain.off('compose:close-ready', ready); ipcMain.off('compose:close-error', failed); closing = false; };
  const destroy = () => { cleanup(); if (!win.isDestroyed()) win.destroy(); };
  const ready = (event: Electron.IpcMainEvent, value: string) => { if (event.sender === win.webContents && value === id) destroy(); };
  const failed = (event: Electron.IpcMainEvent, value: string, message: string) => {
    if (event.sender !== win.webContents || value !== id) return;
    cleanup(); void dialog.showMessageBox(win, { type: 'error', message: '草稿尚未保存，窗口保持打开', detail: message });
  };
  const timer = setTimeout(() => {
    cleanup();
    if (!win.isDestroyed()) void dialog.showMessageBox(win, { type: 'warning', message: '编辑器仍在保存，请稍后关闭。' });
  }, 15_000);
  ipcMain.on('compose:close-ready', ready); ipcMain.on('compose:close-error', failed);
  win.webContents.send('compose:before-close', id);
}
let closing = false;

/** Compose 是否正在显示 */
export function isComposeVisible(): boolean {
  return composeWindow !== null && !composeWindow.isDestroyed() && composeWindow.isVisible();
}

export function getComposeWindow(): BrowserWindow | null {
  return composeWindow;
}

/** Apply one final geometry, without intermediate layout/resize feedback. */
export function resizeComposeWindow(width: number, height: number): void {
  const win = composeWindow;
  if (!win || win.isDestroyed() || !Number.isFinite(width) || !Number.isFinite(height)) return;
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const targetWidth = Math.min(440, area.width);
  const targetHeight = Math.min(Math.max(160, Math.ceil(height)), 500, area.height);
  const position = composePosition(area, targetWidth, targetHeight, shouldCenterWindow(win) ? undefined : bounds);
  const next = {
    width: targetWidth,
    height: targetHeight,
    ...position,
  };
  if (Object.entries(next).every(([key, value]) => bounds[key as keyof typeof bounds] === value)) return;
  win.setBounds(next, false);
}
