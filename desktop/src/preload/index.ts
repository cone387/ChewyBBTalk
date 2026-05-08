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
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  },
};

contextBridge.exposeInMainWorld('desktop', api);
