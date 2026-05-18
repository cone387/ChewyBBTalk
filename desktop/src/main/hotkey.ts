/**
 * 全局快捷键。
 */
import { globalShortcut } from 'electron';
import { getBallWindow } from './windows/ballWindow';
import { showComposeWindow, isComposeVisible, hideComposeWindow } from './windows/composeWindow';

export function registerHotkeys() {
  // Ctrl/Cmd + Shift + B → 切换 Ball 显隐
  globalShortcut.register('CommandOrControl+Shift+B', () => {
    const win = getBallWindow();
    if (!win) return;
    if (win.isVisible()) win.hide();
    else win.show();
  });

  // Ctrl/Cmd + Shift + N → 打开 Compose
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    showComposeWindow();
  });

  // Alt + B → 切换 Compose 编辑框
  globalShortcut.register('Alt+B', () => {
    if (isComposeVisible()) {
      hideComposeWindow();
    } else {
      showComposeWindow();
    }
  });
}

export function unregisterHotkeys() {
  globalShortcut.unregisterAll();
}
