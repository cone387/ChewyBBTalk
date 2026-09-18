/**
 * Preload：通过 contextBridge 把受限 API 暴露到 window.desktop。
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, OverlayInfo } from '../shared/ipc-types';

const api: DesktopApi = {
  updates: {
    getState: () => ipcRenderer.invoke('updates:state'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    onChanged: cb => {
      const listener = (_: unknown, state: Parameters<typeof cb>[0]) => cb(state);
      ipcRenderer.on('updates:changed', listener);
      return () => { ipcRenderer.off('updates:changed', listener); };
    },
  },
  ball: {
    getSuspended: () => ipcRenderer.invoke('ball:get-suspended'),
    onSuspensionChanged: cb => {
      const listener = (_: unknown, suspended: boolean) => cb(suspended);
      ipcRenderer.on('ball:suspension-changed', listener);
      return () => { ipcRenderer.off('ball:suspension-changed', listener); };
    },
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
    onFocusRequested: cb => {
      const listener = () => cb();
      ipcRenderer.on('compose:focus-input', listener);
      return () => { ipcRenderer.off('compose:focus-input', listener); };
    },
    getPinned: () => ipcRenderer.invoke('compose:get-pinned'),
    setPinned: value => ipcRenderer.invoke('compose:set-pinned', value),
    onBeforeClose: cb => {
      const listener = async (_: unknown, id: string) => {
        try { await cb(); ipcRenderer.send('compose:close-ready', id); }
        catch (e) { ipcRenderer.send('compose:close-error', id, e instanceof Error ? e.message : '保存失败'); }
      };
      ipcRenderer.on('compose:before-close', listener);
      return () => { ipcRenderer.off('compose:before-close', listener); };
    },
    listUploads: session => ipcRenderer.invoke('uploads:list', session),
    stageUpload: (session, file) => ipcRenderer.invoke('uploads:stage', session, file),
    retryUpload: (session, id) => ipcRenderer.invoke('uploads:retry', session, id),
    removeUpload: (session, id) => ipcRenderer.invoke('uploads:remove', session, id),
    clearUploads: session => ipcRenderer.invoke('uploads:clear', session),
    previewUpload: (session, id) => ipcRenderer.invoke('uploads:preview', session, id),
    onUploadsChanged: cb => {
      const listener = (_: unknown, scope: string) => cb(scope);
      ipcRenderer.on('uploads:changed', listener);
      return () => { ipcRenderer.off('uploads:changed', listener); };
    },
    show: (ballScreenX?: number, ballScreenY?: number) =>
      ipcRenderer.invoke('compose:show', ballScreenX, ballScreenY),
    hide: () => ipcRenderer.invoke('compose:hide'),
    toggle: (ballScreenX?: number, ballScreenY?: number) =>
      ipcRenderer.invoke('compose:toggle', ballScreenX, ballScreenY),
    submissionSnapshot: () => ipcRenderer.invoke('compose:submission-snapshot'),
    publishSubmission: (session, payload) => ipcRenderer.invoke('compose:publish-submission', session, payload),
    recoverSubmission: (session, retry) => ipcRenderer.invoke('compose:recover-submission', session, retry),
    forgetSubmission: (session, key) => ipcRenderer.invoke('compose:forget-submission', session, key),
    getDraft: (session) => ipcRenderer.invoke('compose:get-draft', session),
    saveDraft: (draft, session) => ipcRenderer.invoke('compose:save-draft', draft, session),
    clearDraft: (session) => ipcRenderer.invoke('compose:clear-draft', session),
    getApiUrl: () => ipcRenderer.invoke('compose:get-api-url'),
    resize: (width: number, height: number) =>
      ipcRenderer.invoke('compose:resize', width, height),
    getVisibility: () => ipcRenderer.invoke('compose:get-visibility'),
    setVisibility: (visibility: 'public' | 'private') =>
      ipcRenderer.invoke('compose:set-visibility', visibility),
    openFileDialog: () => ipcRenderer.invoke('compose:open-file-dialog'),
  },
  auth: {
    browserLogin: (apiUrl) => ipcRenderer.invoke('auth:browser-login', apiUrl),
    cancelBrowserLogin: () => ipcRenderer.invoke('auth:cancel-browser-login'),
    getState: () => ipcRenderer.invoke('auth:state'),
    restore: () => ipcRenderer.invoke('auth:restore'),
    onStateChanged: (cb) => {
      const listener = (_: unknown, state: Parameters<typeof cb>[0]) => cb(state);
      ipcRenderer.on('auth:state-changed', listener);
      return () => { ipcRenderer.off('auth:state-changed', listener); };
    },
    login: (username: string, password: string, apiUrl?: string) =>
      ipcRenderer.invoke('auth:login', username, password, apiUrl),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getAccessToken: () => ipcRenderer.invoke('auth:get-access-token'),
    getValidAccessToken: () => ipcRenderer.invoke('auth:get-valid-access-token'),
    isLoggedIn: () => ipcRenderer.invoke('auth:is-logged-in'),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  },
  login: {
    show: () => ipcRenderer.invoke('login:show'),
    hide: () => ipcRenderer.invoke('login:hide'),
  },
  settings: {
    getVersion: () => ipcRenderer.invoke('settings:get-version'),
    saveServer: apiUrl => ipcRenderer.invoke('settings:save-server', apiUrl),
    show: () => ipcRenderer.invoke('settings:show'),
    hide: () => ipcRenderer.invoke('settings:hide'),
  },
  quit: () => ipcRenderer.invoke('app:quit'),
};

contextBridge.exposeInMainWorld('desktop', api);
