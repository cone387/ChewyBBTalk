import { app, BrowserWindow, ipcMain, Notification } from 'electron';
import updater from 'electron-updater';
import { getComposeWindow, hideComposeWindow } from './windows/composeWindow';
import { showSettingsWindow } from './windows/settingsWindow';
import type { UpdateState } from '../shared/ipc-types';

const { autoUpdater } = updater;
let state: UpdateState = { status: 'idle' };
let checking: Promise<unknown> | undefined;
let downloading: Promise<unknown> | undefined;
function setState(next: UpdateState) {
  state = next;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('updates:changed', state);
  }
}
function failure(error: unknown) {
  console.error('[Update]', error);
  const detail = error instanceof Error ? error.message : String(error);
  if (/404|ERR_UPDATER_LATEST_VERSION_NOT_FOUND/.test(detail) && ['checking', 'unpublished'].includes(state.status)) {
    setState({ status: 'unpublished', message: '桌面更新通道尚未发布版本，暂时无法自动更新。请稍后重新检查。' });
  } else if (/sha512|checksum|signature/i.test(detail)) {
    setState({ status: 'error', message: '更新包校验失败，已停止安装。请重新检查并下载。' });
  } else {
    setState({ status: 'error', message: '无法连接更新服务或下载文件，请稍后重试。' });
  }
}
export function getUpdateState() { return state; }
export async function checkForUpdate() {
  if (state.status === 'unsupported' || downloading || ['downloaded', 'installing'].includes(state.status)) return state;
  if (!checking) {
    setState({ status: 'checking' });
    checking = Promise.resolve().then(() => autoUpdater.checkForUpdates()).catch(failure).finally(() => { checking = undefined; });
  }
  await checking;
  return state;
}
export async function downloadUpdate() {
  if (downloading) { await downloading; return state; }
  if (state.status !== 'available') return state;
  const version = state.version;
  setState({ status: 'downloading', version, percent: 0 });
  downloading = Promise.resolve().then(() => autoUpdater.downloadUpdate()).catch(failure).finally(() => { downloading = undefined; });
  await downloading;
  return state;
}

// The installer starts before app.quit() in electron-updater. Save first, not in before-quit.
async function saveBeforeInstall() {
  const compose = getComposeWindow();
  if (!compose || compose.isDestroyed()) return;
  await new Promise<void>((resolve, reject) => {
    const closed = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      compose.off('closed', closed);
      reject(new Error('草稿保存未完成，请先关闭编辑框，再重试安装。'));
    }, 16_000);
    compose.once('closed', closed);
    hideComposeWindow();
  });
}
export async function installUpdate() {
  if (state.status !== 'downloaded') return state;
  const ready = state;
  setState({ ...ready, status: 'installing' });
  try {
    await saveBeforeInstall();
    autoUpdater.quitAndInstall(false, true);
  } catch (error) {
    setState({ ...ready, message: error instanceof Error ? error.message : '安装失败，请重试。' });
  }
  return state;
}
export function registerUpdater() {
  ipcMain.handle('updates:state', getUpdateState);
  ipcMain.handle('updates:check', checkForUpdate);
  ipcMain.handle('updates:download', downloadUpdate);
  ipcMain.handle('updates:install', installUpdate);
  if (!app.isPackaged || process.platform !== 'win32') {
    setState({ status: 'unsupported', message: !app.isPackaged ? '开发模式不检查更新，请使用安装版。' : '此平台请从发布页下载更新；当前自动更新支持 Windows 安装版。' });
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('error', failure);
  autoUpdater.on('update-available', info => {
    setState({ status: 'available', version: info.version });
    void downloadUpdate();
  });
  autoUpdater.on('update-not-available', () => setState({ status: 'current' }));
  autoUpdater.on('download-progress', progress => setState({ status: 'downloading', version: state.version, percent: Math.max(0, Math.min(100, progress.percent)) }));
  autoUpdater.on('update-downloaded', info => {
    setState({ status: 'downloaded', version: info.version });
    if (Notification.isSupported()) {
      const notice = new Notification({ title: 'ChewyBBTalk 更新已就绪', body: `v${info.version} 已下载，打开设置后可保存草稿并重启安装。` });
      notice.on('click', showSettingsWindow); notice.show();
    }
  });
  const startup = setTimeout(() => { void checkForUpdate(); }, 15_000);
  const periodic = setInterval(() => { void checkForUpdate(); }, 6 * 60 * 60 * 1000);
  startup.unref(); periodic.unref();
  app.once('will-quit', () => { clearTimeout(startup); clearInterval(periodic); });
}
