import { BrowserWindow, screen } from 'electron';
import { store } from '../store';
import { composePosition } from './placement';

type WindowKind = 'compose' | 'settings' | 'login';
const centered = new WeakMap<BrowserWindow, boolean>();
export function initialWindowPosition(kind: WindowKind, width: number, height: number) {
  const saved = store.get('windows')?.[kind];
  const display = saved
    ? screen.getDisplayMatching({ ...saved, width, height })
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return composePosition(display.workArea, width, height, saved);
}
export function trackWindowPosition(win: BrowserWindow, kind: WindowKind) {
  let movedByUser = !!store.get('windows')?.[kind];
  centered.set(win, !movedByUser);
  win.on('will-move', () => { movedByUser = true; centered.set(win, false); });
  const save = () => {
    if (!movedByUser || win.isDestroyed()) return;
    const { x, y } = win.getBounds();
    store.set('windows', { ...store.get('windows'), [kind]: { x, y } });
  };
  win.on('moved', save);
  win.on('close', save);
}
export function shouldCenterWindow(win: BrowserWindow) { return centered.get(win) === true; }
