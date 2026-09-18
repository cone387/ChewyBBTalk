/**
 * Electron 主进程入口。
 *
 * M1 Ball 样机（新架构）：Ball 是一个全屏透明覆盖层中的 div，
 * 拖动由渲染侧的 CSS transform 完成，主进程只负责：
 *   - 创建/销毁 overlay 窗口
 *   - 点透开关
 *   - 位置持久化
 *   - 显示器热插拔时重算 overlay 尺寸
 */
import { app, BrowserWindow, powerMonitor } from 'electron';
import { createBallWindow } from './windows/ballWindow';
import { registerBallIpc, registerDisplayWatchers } from './ipc/ballIpc';
import { registerComposeIpc } from './ipc/composeIpc';
import { registerAuthIpc } from './ipc/authIpc';
import { tryRestoreSession } from './auth';
import { createTray } from './tray';
import { registerHotkeys, unregisterHotkeys } from './hotkey';
import { getComposeWindow, hideComposeWindow } from './windows/composeWindow';
import { cancelBrowserLogin } from './browserAuth';
import { setupCsp } from './security';
import { registerUpdater } from './updater';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();


app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.chewybbtalk.desktop');
  setupCsp();
  registerBallIpc();
  registerComposeIpc();
  registerAuthIpc();
  registerUpdater();
  registerDisplayWatchers();
  registerHotkeys();
  createTray();
  createBallWindow();
  powerMonitor.on('resume', () => { void tryRestoreSession(); });

  // 启动时尝试恢复登录态
  tryRestoreSession().then((ok) => {
    console.log('[Auth] session restore:', ok ? 'success' : 'no saved session');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createBallWindow();
    }
  });
});

app.on('before-quit', event => {
  (app as any)._isQuitting = true;
  cancelBrowserLogin();
  const compose = getComposeWindow();
  if (compose && !compose.isDestroyed()) {
    event.preventDefault();
    compose.once('closed', () => app.quit());
    hideComposeWindow();
  }
});

app.on('will-quit', () => {
  unregisterHotkeys();
});

app.on('window-all-closed', () => {
  // no-op：后台常驻工具
});
