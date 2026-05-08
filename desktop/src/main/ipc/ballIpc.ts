/**
 * Ball 相关 IPC：点透开关、overlay 信息、显示器热插拔广播。
 *
 * 注意：新架构下拖动完全在渲染侧用 CSS transform 完成，
 * 主进程不再管 setPosition / drag loop / snap animation。
 */
import { ipcMain, screen, shell } from 'electron';
import { computeOverlayBounds, getBallWindow, resizeOverlayToDisplays } from '../windows/ballWindow';
import { getBallState, setBallPosition } from '../store';

export interface OverlayInfo {
  /** overlay 窗口在屏幕坐标系的左上角（DIP） */
  overlay: { x: number; y: number; width: number; height: number };
  /** 所有显示器的工作区（DIP） */
  displays: Array<{ id: number; x: number; y: number; width: number; height: number }>;
  /** 用户上次保存的 Ball 位置（窗口坐标系，DIP）；首次启动为 null */
  savedPosition: { x: number; y: number } | null;
}

function buildOverlayInfo(): OverlayInfo {
  const overlay = computeOverlayBounds();
  const displays = screen.getAllDisplays().map((d) => ({
    id: d.id,
    x: d.workArea.x,
    y: d.workArea.y,
    width: d.workArea.width,
    height: d.workArea.height,
  }));
  const saved = getBallState().position;
  return { overlay, displays, savedPosition: saved ? { x: saved.x, y: saved.y } : null };
}

function broadcastOverlayInfo() {
  const win = getBallWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('ball:overlay-info', buildOverlayInfo());
}

export function registerBallIpc() {
  // 点透开关：渲染侧根据鼠标是否在 Ball 圆内调用
  ipcMain.handle('ball:set-ignore-mouse-events', (_, ignore: boolean) => {
    const win = getBallWindow();
    if (!win || win.isDestroyed()) return;
    win.setIgnoreMouseEvents(ignore, { forward: true });
  });

  // 初始信息拉取
  ipcMain.handle('ball:get-overlay-info', () => {
    return buildOverlayInfo();
  });

  // 渲染侧保存 Ball 位置（窗口坐标系）
  ipcMain.handle('ball:save-position', (_, x: number, y: number) => {
    // 当前 display id 由渲染侧通过 overlay 信息可以判断；此处先不存 displayId
    setBallPosition(Math.round(x), Math.round(y), null);
  });

  ipcMain.handle('shell:open-external', (_, url: string) => {
    return shell.openExternal(url);
  });
}

export function registerDisplayWatchers() {
  const onChange = () => {
    resizeOverlayToDisplays();
    broadcastOverlayInfo();
  };
  screen.on('display-added', onChange);
  screen.on('display-removed', onChange);
  screen.on('display-metrics-changed', onChange);
}
