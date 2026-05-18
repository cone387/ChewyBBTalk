/**
 * 主进程 ↔ 渲染进程 IPC 类型定义。
 */

export interface DisplayInfo {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayInfo {
  overlay: { x: number; y: number; width: number; height: number };
  displays: DisplayInfo[];
  savedPosition: { x: number; y: number } | null;
}

export interface BallApi {
  /** 点透开关 */
  setIgnoreMouseEvents(ignore: boolean): Promise<void>;
  /** 拉取 overlay 初始信息 */
  getOverlayInfo(): Promise<OverlayInfo>;
  /** 保存当前 Ball 在窗口坐标系里的位置（退出时恢复用） */
  savePosition(x: number, y: number): Promise<void>;
  /** 订阅显示器变化导致的 overlay 重建 */
  onOverlayInfo(cb: (info: OverlayInfo) => void): () => void;
}

export interface ShellApi {
  openExternal(url: string): Promise<void>;
}

export interface ComposeApi {
  show(ballScreenX?: number, ballScreenY?: number): Promise<void>;
  hide(): Promise<void>;
  toggle(ballScreenX?: number, ballScreenY?: number): Promise<void>;
  getDraft(): Promise<string>;
  saveDraft(draft: string): Promise<void>;
  clearDraft(): Promise<void>;
  getApiUrl(): Promise<string>;
  resize(width: number, height: number): Promise<void>;
  getVisibility(): Promise<'public' | 'private'>;
  setVisibility(visibility: 'public' | 'private'): Promise<void>;
  openFileDialog(): Promise<string[]>;
}

export interface AuthApi {
  login(username: string, password: string, apiUrl?: string): Promise<{ ok: boolean; error?: string }>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  isLoggedIn(): Promise<boolean>;
}

export interface DesktopApi {
  ball: BallApi;
  compose: ComposeApi;
  auth: AuthApi;
  shell: ShellApi;
  login: LoginApi;
  settings: SettingsApi;
  quit(): Promise<void>;
}

export interface LoginApi {
  show(): Promise<void>;
  hide(): Promise<void>;
}

export interface SettingsApi {
  show(): Promise<void>;
  hide(): Promise<void>;
}

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}
