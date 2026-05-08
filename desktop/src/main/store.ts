/**
 * electron-store 封装 + 类型约束。
 *
 * 结构对齐 design.md "数据模型" 章节的 schema。
 */
import Store from 'electron-store';
import type { Edge } from '../shared/constants';
import type { PreferredSnapPoint } from './ball/snap';

export interface BallState {
  position: { x: number; y: number; displayId: number | null } | null;
  snapPreferred: Record<string, PreferredSnapPoint[]>; // key = displayId as string
  snappedEdge: Edge | null;
  size: number;
  color: string;
  hideOnFullscreen: boolean;
}

export interface SettingsSchema {
  auth: { apiUrl: string; username: string };
  ball: BallState;
  general: { autoStart: boolean; notifyOnPublish: boolean; webUrl: string };
  hotkey: { toggleBall: string; newBBTalk: string };
  compose: {
    draft: string;
    visibility: 'public' | 'private' | 'friends';
    lastSize: { width: number; height: number } | null;
    outbox: unknown[];
  };
  ai: { provider: string; openaiApiKey: string; customEndpoint: string };
}

const DEFAULTS: SettingsSchema = {
  auth: { apiUrl: 'https://bbtalk.cone387.top', username: '' },
  ball: {
    position: null,
    snapPreferred: {},
    snappedEdge: null,
    size: 56,
    color: '#3B82F6',
    hideOnFullscreen: true,
  },
  general: {
    autoStart: false,
    notifyOnPublish: true,
    webUrl: 'https://bbtalk.cone387.top',
  },
  hotkey: {
    toggleBall: 'CommandOrControl+Shift+B',
    newBBTalk: 'CommandOrControl+Shift+N',
  },
  compose: { draft: '', visibility: 'private', lastSize: null, outbox: [] },
  ai: { provider: 'noop', openaiApiKey: '', customEndpoint: '' },
};

// electron-store 默认路径 = app.getPath('userData')/config.json
export const store = new Store<SettingsSchema>({
  name: 'chewybbtalk',
  defaults: DEFAULTS,
});

export function getBallState(): BallState {
  return store.get('ball');
}

export function setBallPosition(x: number, y: number, displayId: number | null): void {
  const ball = store.get('ball');
  store.set('ball', { ...ball, position: { x: Math.round(x), y: Math.round(y), displayId } });
}

export function setSnappedEdge(edge: Edge | null): void {
  const ball = store.get('ball');
  store.set('ball', { ...ball, snappedEdge: edge });
}

export function getSnapPreferred(displayId: number): PreferredSnapPoint[] {
  const ball = store.get('ball');
  return ball.snapPreferred[String(displayId)] ?? [];
}

export function setSnapPreferred(displayId: number, points: PreferredSnapPoint[]): void {
  const ball = store.get('ball');
  store.set('ball', {
    ...ball,
    snapPreferred: { ...ball.snapPreferred, [String(displayId)]: points },
  });
}
