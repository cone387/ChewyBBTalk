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

export interface DesktopApi {
  ball: BallApi;
  shell: ShellApi;
}

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}
