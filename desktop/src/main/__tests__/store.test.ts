import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  class FakeStore {
    static lastOptions: unknown;
    data = new Map<string, unknown>();
    options: any;
    constructor(options?: any) { this.options = options; FakeStore.lastOptions = options; }
    get(key: string) {
      if (this.data.has(key)) return this.data.get(key);
      return this.options?.defaults?.[key];
    }
    set(key: string, value: unknown) { this.data.set(key, structuredClone(value)); return this; }
  }
  return { FakeStore, options: undefined as any };
});

vi.mock('electron-store', () => ({ default: state.FakeStore }));

beforeEach(() => {
  vi.resetModules();
  state.FakeStore.lastOptions = undefined;
});

it('creates the store with the app name and schema defaults', async () => {
  const { store } = await import('../store');
  expect(state.FakeStore.lastOptions).toMatchObject({ name: 'chewybbtalk' });
  const defaults = (state.FakeStore.lastOptions as any).defaults;
  expect(defaults).toMatchObject({
    auth: { apiUrl: 'https://bbtalk.cone387.top', username: '' },
    ball: { position: null, snappedEdge: null, size: 56, hideOnFullscreen: true },
    general: { autoStart: false, notifyOnPublish: true },
    compose: { draft: '', visibility: 'private', lastSize: null, outbox: [] },
    ai: { provider: 'noop' },
  });
  expect(store.get('ball')).toEqual(defaults.ball);
  expect(store.get('general')).toEqual(defaults.general);
});

it('reads and writes ball positions with rounding', async () => {
  const storeMod = await import('../store');
  expect(storeMod.getBallState().position).toBeNull();
  storeMod.setBallPosition(12.6, -3.2, 7);
  expect(storeMod.getBallState().position).toEqual({ x: 13, y: -3, displayId: 7 });
});

it('tracks the snapped edge separately from the position', async () => {
  const storeMod = await import('../store');
  storeMod.setSnappedEdge('left');
  expect(storeMod.getBallState().snappedEdge).toBe('left');
  storeMod.setSnappedEdge(null);
  expect(storeMod.getBallState().snappedEdge).toBeNull();
});

it('keeps preferred snap points keyed by display without cross-talk', async () => {
  const storeMod = await import('../store');
  expect(storeMod.getSnapPreferred(3)).toEqual([]);
  const points = [{ edge: 'left', ratio: 0.5 }] as any;
  storeMod.setSnapPreferred(3, points);
  storeMod.setSnapPreferred(4, [] as any);
  expect(storeMod.getSnapPreferred(3)).toEqual(points);
  expect(storeMod.getSnapPreferred(4)).toEqual([]);
  expect(storeMod.getSnapPreferred(5)).toEqual([]);
});

it('preserves other ball fields when position or snap updates', async () => {
  const storeMod = await import('../store');
  storeMod.setSnappedEdge('right');
  storeMod.setBallPosition(10, 10, null);
  const ball = storeMod.getBallState();
  expect(ball).toMatchObject({ snappedEdge: 'right', size: 56, position: { x: 10, y: 10, displayId: null } });
});
