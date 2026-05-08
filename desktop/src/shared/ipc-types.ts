/**
 * 主进程 ↔ 渲染进程 IPC 类型定义。
 * preload 里暴露给 window.desktop 的 API 以此为契约。
 */
import type { Edge } from './constants';

export interface Point {
  x: number;
  y: number;
}

export interface BallApi {
  setPosition(x: number, y: number): Promise<void>;
  getPosition(): Promise<Point>;
  snapToNearestEdge(): Promise<{ edge: Edge | null; x: number; y: number }>;
  onSnapStateChanged(cb: (edge: Edge | null) => void): () => void; // 返回 unsubscribe
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
