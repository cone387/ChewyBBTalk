/**
 * 认证相关 IPC。
 */
import { ipcMain } from 'electron';
import { login, logout, getAccessToken, getValidAccessToken, isLoggedIn } from '../auth';

export function registerAuthIpc() {
  ipcMain.handle('auth:login', async (_, username: string, password: string, apiUrl?: string) => {
    return login(username, password, apiUrl);
  });

  ipcMain.handle('auth:logout', () => {
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
