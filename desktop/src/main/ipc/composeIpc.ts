/**
 * Compose 相关 IPC：打开/关闭窗口、发布 BBTalk、草稿读写。
 */
import { ipcMain, dialog } from 'electron';
import { showComposeWindow, hideComposeWindow, isComposeVisible, resizeComposeWindow } from '../windows/composeWindow';
import { showLoginWindow, hideLoginWindow } from '../windows/loginWindow';
import { showSettingsWindow, hideSettingsWindow } from '../windows/settingsWindow';
import { store } from '../store';

export function registerComposeIpc() {
  ipcMain.handle('compose:show', (_, ballX?: number, ballY?: number) => {
    showComposeWindow(ballX, ballY);
  });

  ipcMain.handle('compose:hide', () => {
    hideComposeWindow();
  });

  ipcMain.handle('compose:toggle', (_, ballX?: number, ballY?: number) => {
    if (isComposeVisible()) {
      hideComposeWindow();
    } else {
      showComposeWindow(ballX, ballY);
    }
  });

  ipcMain.handle('compose:get-draft', () => {
    return store.get('compose.draft') ?? '';
  });

  ipcMain.handle('compose:save-draft', (_, draft: string) => {
    store.set('compose.draft', draft);
  });

  ipcMain.handle('compose:clear-draft', () => {
    store.set('compose.draft', '');
  });

  ipcMain.handle('compose:get-api-url', () => {
    return store.get('auth.apiUrl') ?? 'https://bbtalk.cone387.top';
  });

  ipcMain.handle('compose:resize', (_, width: number, height: number) => {
    resizeComposeWindow(width, height);
  });

  ipcMain.handle('compose:get-visibility', () => {
    return store.get('compose.visibility') ?? 'private';
  });

  ipcMain.handle('compose:set-visibility', (_, visibility: string) => {
    store.set('compose.visibility', visibility as 'public' | 'private');
  });

  ipcMain.handle('compose:open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled) return [];
    return result.filePaths;
  });

  ipcMain.handle('login:show', () => {
    showLoginWindow();
  });

  ipcMain.handle('login:hide', () => {
    hideLoginWindow();
  });

  ipcMain.handle('settings:show', () => {
    showSettingsWindow();
  });

  ipcMain.handle('settings:hide', () => {
    hideSettingsWindow();
  });
}
