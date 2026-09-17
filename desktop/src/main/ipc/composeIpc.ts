/**
 * Compose 相关 IPC：打开/关闭窗口、发布 BBTalk、草稿读写。
 */
import { ipcMain, dialog } from 'electron';
import { showComposeWindow, hideComposeWindow, isComposeVisible, resizeComposeWindow } from '../windows/composeWindow';
import { showLoginWindow, hideLoginWindow } from '../windows/loginWindow';
import { showSettingsWindow, hideSettingsWindow } from '../windows/settingsWindow';
import { store } from '../store';
import { assertSession, submissionSnapshot, publishSubmission, recoverSubmission, forgetSubmission } from '../submissions';
import type { SubmissionPayload, SubmissionSession } from '../../shared/ipc-types';

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

  ipcMain.handle('compose:submission-snapshot', () => submissionSnapshot());
  ipcMain.handle('compose:publish-submission', (_, session: SubmissionSession, payload: SubmissionPayload) => publishSubmission(session, payload));
  ipcMain.handle('compose:recover-submission', (_, session: SubmissionSession, retry: boolean) => recoverSubmission(session, retry));
  ipcMain.handle('compose:forget-submission', (_, session: SubmissionSession, key: string) => forgetSubmission(session, key));
  ipcMain.handle('compose:get-draft', (_, session: SubmissionSession) => {
    assertSession(session);
    return store.get('compose.drafts')?.[session.scope] ?? '';
  });
  ipcMain.handle('compose:save-draft', (_, draft: string, session: SubmissionSession) => {
    assertSession(session);
    store.set('compose.drafts', { ...store.get('compose.drafts'), [session.scope]: draft });
  });
  ipcMain.handle('compose:clear-draft', (_, session: SubmissionSession) => {
    assertSession(session);
    const drafts = { ...store.get('compose.drafts') };
    delete drafts[session.scope];
    store.set('compose.drafts', drafts);
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
