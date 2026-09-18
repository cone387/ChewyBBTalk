/**
 * 认证相关 IPC。
 */
import { ipcMain, BrowserWindow } from 'electron';
import { login, logout, getAccessToken, getValidAccessToken, isLoggedIn, getAuthState, authEvents, tryRestoreSession } from '../auth';
import { browserLogin, cancelBrowserLogin } from '../browserAuth';

export function registerAuthIpc() {
  ipcMain.handle('auth:browser-login', (_, apiUrl?: string) => browserLogin(apiUrl));
  ipcMain.handle('auth:cancel-browser-login', () => cancelBrowserLogin());
  ipcMain.handle('auth:state', () => getAuthState());
  ipcMain.handle('auth:restore', () => tryRestoreSession());
  authEvents.on('change', state => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('auth:state-changed', state);
  });
  ipcMain.handle('auth:login', async (_, username: string, password: string, apiUrl?: string) => {
    return login(username, password, apiUrl);
  });

  ipcMain.handle('auth:logout', () => {
    cancelBrowserLogin();
    logout();
  });

  ipcMain.handle('auth:get-access-token', () => {
    return getAccessToken();
  });

  ipcMain.handle('auth:get-valid-access-token', () => getValidAccessToken());

  ipcMain.handle('auth:is-logged-in', () => {
    return isLoggedIn();
  });
}
