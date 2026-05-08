/**
 * Preload：通过 contextBridge 把受限 API 暴露到 window.desktop。
 *
 * 严格遵守：
 *   - 不暴露 Node 模块
 *   - 不暴露 ipcRenderer 本身，只暴露具体方法
 *   - 所有方法都返回 Promise 或具体值
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/ipc-types';
import type { Edge } from '../shared/constants';

const api: DesktopApi = {
  ball: {
    setPosition: (x: number, y: number) => ipcRenderer.invoke('ball:set-position', x, y),
    getPosition: () => ipcRenderer.invoke('ball:get-position'),
    snapToNearestEdge: () => ipcRenderer.invoke('ball:snap-to-nearest-edge'),
    onSnapStateChanged: (cb: (edge: Edge | null) => void) => {
      const listener = (_: unknown, edge: Edge | null) => cb(edge);
      ipcRenderer.on('ball:snap-state-changed', listener);
      return () => ipcRenderer.off('ball:snap-state-changed', listener);
    },
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  },
};

contextBridge.exposeInMainWorld('desktop', api);
