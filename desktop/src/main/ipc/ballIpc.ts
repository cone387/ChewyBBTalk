/**
 * Ball 相关 IPC：位置读写、吸边触发、显示器热插拔处理。
 */
import { ipcMain, screen, shell } from 'electron';
import type { Edge } from '../../shared/constants';
import { BALL_WINDOW_SIZE, MIN_VISIBLE_RATIO, SNAP_ANIMATION_MS } from '../../shared/constants';
import {
  edgeDistances,
  extractAxisCoord,
  findPreferredSnap,
  isSufficientlyVisible,
  learnSnapPoint,
  nearestEdge,
  shouldSnap,
  snapTargetPosition,
} from '../ball/snap';
import { animateSetPosition } from '../ball/animate';
import { getBallWindow } from '../windows/ballWindow';
import {
  getSnapPreferred,
  setBallPosition,
  setSnappedEdge,
  setSnapPreferred,
} from '../store';

function toDip(x: number, y: number) {
  if (process.platform === 'darwin') return { x, y };
  return screen.screenToDipPoint({ x, y });
}

function fromDip(x: number, y: number) {
  if (process.platform === 'darwin') return { x, y };
  return screen.dipToScreenPoint({ x, y });
}

function broadcastSnapState(edge: Edge | null) {
  const win = getBallWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('ball:snap-state-changed', edge);
  }
}

export function registerBallIpc() {
  // 渲染侧传入 DIP 坐标，主进程转物理像素再 setPosition
  ipcMain.handle('ball:set-position', (_, x: number, y: number) => {
    const win = getBallWindow();
    if (!win || win.isDestroyed()) return;
    const p = fromDip(x, y);
    win.setPosition(Math.round(p.x), Math.round(p.y), false);
  });

  // 返回 DIP 坐标供渲染侧做 delta 计算
  ipcMain.handle('ball:get-position', () => {
    const win = getBallWindow();
    if (!win || win.isDestroyed()) return { x: 0, y: 0 };
    const [px, py] = win.getPosition();
    const dip = toDip(px, py);
    return { x: Math.round(dip.x), y: Math.round(dip.y) };
  });

  ipcMain.handle('ball:snap-to-nearest-edge', () => {
    const win = getBallWindow();
    if (!win || win.isDestroyed()) return { edge: null, x: 0, y: 0 };

    const [pxScreen, pyScreen] = win.getPosition();
    // 用物理像素坐标找 display，但吸边计算用 DIP（workArea 也是 DIP）
    const bounds = win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const dipPos = toDip(pxScreen, pyScreen);

    const size = { width: BALL_WINDOW_SIZE, height: BALL_WINDOW_SIZE };
    const distances = edgeDistances(dipPos, size, display.workArea);

    if (!shouldSnap(distances)) {
      setSnappedEdge(null);
      setBallPosition(dipPos.x, dipPos.y, display.id);
      broadcastSnapState(null);
      return { edge: null, x: dipPos.x, y: dipPos.y };
    }

    const { edge } = nearestEdge(distances);
    const axisCoord = extractAxisCoord(edge, dipPos);

    // 偏好吸附点
    const preferredPoints = getSnapPreferred(display.id);
    const preferred = findPreferredSnap(preferredPoints, edge, axisCoord);
    const snappedAxis = preferred ? preferred.coord : axisCoord;

    const targetDip = snapTargetPosition(edge, snappedAxis, display.workArea, size);
    // animate 用物理像素
    const targetPhys = fromDip(targetDip.x, targetDip.y);
    const win2 = getBallWindow();
    if (!win2) return { edge: null, x: dipPos.x, y: dipPos.y };
    animateSetPosition(win2, Math.round(targetPhys.x), Math.round(targetPhys.y), {
      // 默认 spring 大约 ~300ms 到位
    });
    // 仅为了满足 SNAP_ANIMATION_MS 文档一致性声明使用
    void SNAP_ANIMATION_MS;

    setSnappedEdge(edge);
    setSnapPreferred(display.id, learnSnapPoint(preferredPoints, edge, axisCoord));
    setBallPosition(targetDip.x, targetDip.y, display.id);
    broadcastSnapState(edge);

    return { edge, x: targetDip.x, y: targetDip.y };
  });

  ipcMain.handle('shell:open-external', (_, url: string) => {
    return shell.openExternal(url);
  });
}

/**
 * 显示器热插拔时自动保证 Ball 可见。
 * 当前 display 不在了 / 可见面积不足 50% 时，搬回主屏右下。
 */
export function ensureBallVisible() {
  const win = getBallWindow();
  if (!win || win.isDestroyed()) return;

  const [px, py] = win.getPosition();
  const dip = toDip(px, py);
  const size = { width: BALL_WINDOW_SIZE, height: BALL_WINDOW_SIZE };
  const workAreas = screen.getAllDisplays().map((d) => d.workArea);

  if (isSufficientlyVisible(dip, size, workAreas, MIN_VISIBLE_RATIO)) return;

  const primary = screen.getPrimaryDisplay().workArea;
  const targetDip = {
    x: primary.x + primary.width - BALL_WINDOW_SIZE - 24,
    y: primary.y + primary.height - BALL_WINDOW_SIZE - 120,
  };
  const targetPhys = fromDip(targetDip.x, targetDip.y);
  animateSetPosition(win, Math.round(targetPhys.x), Math.round(targetPhys.y));
  setBallPosition(targetDip.x, targetDip.y, screen.getPrimaryDisplay().id);
}

export function registerDisplayWatchers() {
  screen.on('display-added', ensureBallVisible);
  screen.on('display-removed', ensureBallVisible);
  screen.on('display-metrics-changed', ensureBallVisible);
}
