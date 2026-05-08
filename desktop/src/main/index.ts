/**
 * Electron 主进程入口。
 *
 * 本里程碑 (M1 Ball 样机) 只启动 Ball 窗口，不创建托盘 / 登录 / Compose。
 */
import { app, BrowserWindow, session } from 'electron';
import { createBallWindow } from './windows/ballWindow';
import { registerBallIpc, registerDisplayWatchers } from './ipc/ballIpc';

// macOS：通过单实例保证命令行启动 / 再次打开不会重复拉起
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function setupCsp() {
  // 除了接入 API 和自身资源，不允许其他脚本
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // React styled + CSS Modules 需要 inline
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://bbtalk.cone387.top http://localhost:* ws://localhost:*",
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
  registerDisplayWatchers();
  createBallWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createBallWindow();
    }
  });
});

// 关闭所有窗口时不退出：桌面端是后台常驻工具
app.on('window-all-closed', () => {
  // no-op
});
