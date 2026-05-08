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
import { app, BrowserWindow, session } from 'electron';
import { createBallWindow } from './windows/ballWindow';
import { registerBallIpc, registerDisplayWatchers } from './ipc/ballIpc';
import { registerComposeIpc } from './ipc/composeIpc';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

function setupCsp() {
  const isDev = !!process.env['ELECTRON_RENDERER_URL'];

  const csp = isDev
    ? [
        "default-src 'self' http://localhost:* ws://localhost:*",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https: http://localhost:*",
        "connect-src 'self' https://bbtalk.cone387.top http://localhost:* ws://localhost:*",
        "font-src 'self' data:",
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://bbtalk.cone387.top",
        "font-src 'self' data:",
      ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

app.whenReady().then(() => {
  setupCsp();
  registerBallIpc();
  registerComposeIpc();
  registerDisplayWatchers();
  createBallWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createBallWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // no-op：后台常驻工具
});
