export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'current' | 'error' | 'unsupported' | 'unpublished';
  version?: string;
  percent?: number;
  message?: string;
}
export interface AuthState {
  status: 'restoring' | 'authenticated' | 'offline' | 'expired' | 'signed-out';
  username: string;
  apiUrl: string;
  persistent: boolean;
}
export interface UploadItem {
  id: string;
  uid?: string;
  name: string;
  mimeType: string;
  fileSize: number;
  type: 'image' | 'video' | 'audio' | 'file';
  status: 'queued' | 'uploading' | 'uploaded' | 'failed';
  error?: string;
}
export interface SubmissionSession { scope: string; generation: number }
export interface SubmissionPayload {
  content: string;
  post_tags?: string;
  attachments: { uid: string }[];
  visibility: 'public' | 'private';
  context: Record<string, unknown>;
}
export interface SubmissionIntent {
  key: string;
  payload: SubmissionPayload;
  state: 'pending' | 'confirmed';
  deleted?: boolean;
}
export interface SubmissionSnapshot {
  session: SubmissionSession;
  intent?: SubmissionIntent;
}

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
  getSuspended(): Promise<boolean>;
  onSuspensionChanged(cb: (suspended: boolean) => void): () => void;
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
  onFocusRequested(cb: () => void): () => void;
  getPinned(): Promise<boolean>;
  setPinned(value: boolean): Promise<void>;
  onBeforeClose(cb: () => Promise<void>): () => void;
  listUploads(session: SubmissionSession): Promise<UploadItem[]>;
  stageUpload(session: SubmissionSession, file: { name: string; mimeType: string; bytes: Uint8Array }): Promise<UploadItem>;
  retryUpload(session: SubmissionSession, id: string): Promise<void>;
  removeUpload(session: SubmissionSession, id: string): Promise<void>;
  clearUploads(session: SubmissionSession): Promise<void>;
  previewUpload(session: SubmissionSession, id: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
  onUploadsChanged(cb: (scope: string) => void): () => void;
  show(ballScreenX?: number, ballScreenY?: number): Promise<void>;
  hide(): Promise<void>;
  toggle(ballScreenX?: number, ballScreenY?: number): Promise<void>;
  submissionSnapshot(): Promise<SubmissionSnapshot | null>;
  publishSubmission(session: SubmissionSession, payload: SubmissionPayload): Promise<SubmissionIntent>;
  recoverSubmission(session: SubmissionSession, retry: boolean): Promise<SubmissionIntent>;
  forgetSubmission(session: SubmissionSession, key: string): Promise<void>;
  getDraft(session: SubmissionSession): Promise<string>;
  saveDraft(draft: string, session: SubmissionSession): Promise<void>;
  clearDraft(session: SubmissionSession): Promise<void>;
  getApiUrl(): Promise<string>;
  resize(width: number, height: number): Promise<void>;
  getVisibility(): Promise<'public' | 'private'>;
  setVisibility(visibility: 'public' | 'private'): Promise<void>;
  openFileDialog(): Promise<string[]>;
}

export interface AuthApi {
  browserLogin(apiUrl?: string): Promise<{ ok: boolean; error?: string }>;
  cancelBrowserLogin(): Promise<void>;
  getState(): Promise<AuthState>;
  restore(): Promise<boolean>;
  onStateChanged(cb: (state: AuthState) => void): () => void;
  login(username: string, password: string, apiUrl?: string): Promise<{ ok: boolean; error?: string }>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  getValidAccessToken(): Promise<string | null>;
  isLoggedIn(): Promise<boolean>;
}

export interface DesktopApi {
  updates: {
    getState(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    download(): Promise<UpdateState>;
    install(): Promise<UpdateState>;
    onChanged(cb: (state: UpdateState) => void): () => void;
  };
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
  getVersion(): Promise<string>;
  saveServer(apiUrl: string): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
}

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}
