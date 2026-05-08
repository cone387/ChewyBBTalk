/**
 * Compose 相关 IPC：打开/关闭窗口、发布 BBTalk、草稿读写。
 */
import { ipcMain } from 'electron';
import { showComposeWindow, hideComposeWindow } from '../windows/composeWindow';
import { store } from '../store';

export function registerComposeIpc() {
  ipcMain.handle('compose:show', () => {
    showComposeWindow();
  });

  ipcMain.handle('compose:hide', () => {
    hideComposeWindow();
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
}
