/**
 * Preload：通过 contextBridge 把受限 API 暴露到 window.desktop。
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, OverlayInfo } from '../shared/ipc-types';

const api: DesktopApi = {
  ball: {
    setIgnoreMouseEvents: (ignore: boolean) =>
      ipcRenderer.invoke('ball:set-ignore-mouse-events', ignore),
    getOverlayInfo: () => ipcRenderer.invoke('ball:get-overlay-info'),
    savePosition: (x: number, y: number) => ipcRenderer.invoke('ball:save-position', x, y),
    onOverlayInfo: (cb: (info: OverlayInfo) => void) => {
      const listener = (_: unknown, info: OverlayInfo) => cb(info);
      ipcRenderer.on('ball:overlay-info', listener);
      return () => ipcRenderer.off('ball:overlay-info', listener);
    },
  },
  compose: {
    show: (ballScreenX?: number, ballScreenY?: number) =>
      ipcRenderer.invoke('compose:show', ballScreenX, ballScreenY),
    hide: () => ipcRenderer.invoke('compose:hide'),
    toggle: (ballScreenX?: number, ballScreenY?: number) =>
      ipcRenderer.invoke('compose:toggle', ballScreenX, ballScreenY),
    getDraft: () => ipcRenderer.invoke('compose:get-draft'),
    saveDraft: (draft: string) => ipcRenderer.invoke('compose:save-draft', draft),
    clearDraft: () => ipcRenderer.invoke('compose:clear-draft'),
    getApiUrl: () => ipcRenderer.invoke('compose:get-api-url'),
  },
  auth: {
    login: (username: string, password: string, apiUrl?: string) =>
      ipcRenderer.invoke('auth:login', username, password, apiUrl),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getAccessToken: () => ipcRenderer.invoke('auth:get-access-token'),
    isLoggedIn: () => ipcRenderer.invoke('auth:is-logged-in'),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  },
  quit: () => ipcRenderer.invoke('app:quit'),
};

contextBridge.exposeInMainWorld('desktop', api);
