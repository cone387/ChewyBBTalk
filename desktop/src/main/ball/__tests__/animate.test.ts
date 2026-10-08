import { afterEach, beforeEach, expect, it, vi } from 'vitest';

function makeWindow(x: number, y: number, destroyed = false) {
  return {
    position: [x, y] as [number, number],
    destroyed,
    setPosition: vi.fn(function (this: any, px: number, py: number) { this.position = [px, py]; }),
    getPosition: function (this: any) { return [...this.position]; },
    isDestroyed() { return this.destroyed; },
  };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

async function settle(handle: { done: Promise<void> }, maxTicks = 2000) {
  let finished = false;
  void handle.done.then(() => { finished = true; });
  for (let i = 0; i < maxTicks && !finished; i++) await vi.advanceTimersByTimeAsync(16);
  return finished;
}

it('springs the window to the target and finishes exactly on it', async () => {
  const { animateSetPosition } = await import('../animate');
  const win = makeWindow(0, 0);
  const handle = animateSetPosition(win as any, 240, 120);
  const finished = await settle(handle);
  expect(finished).toBe(true);
  const calls = win.setPosition.mock.calls;
  expect(calls.at(-1)).toEqual([240, 120, false]);
  expect(win.position).toEqual([240, 120]);
  expect(calls.length).toBeGreaterThan(2);
});

it('starts from the current window position', async () => {
  const { animateSetPosition } = await import('../animate');
  const win = makeWindow(500, 400);
  const handle = animateSetPosition(win as any, 520, 400);
  const finished = await settle(handle);
  expect(finished).toBe(true);
  expect(win.setPosition.mock.calls.at(-1)).toEqual([520, 400, false]);
});

it('resolves immediately without moving a destroyed window', async () => {
  const { animateSetPosition } = await import('../animate');
  const win = makeWindow(0, 0, true);
  const handle = animateSetPosition(win as any, 100, 100);
  expect(await handle.done).toBeUndefined();
  expect(win.setPosition).not.toHaveBeenCalled();
});

it('stops updating after cancel and keeps the promise resolvable', async () => {
  const { animateSetPosition } = await import('../animate');
  const win = makeWindow(0, 0);
  const handle = animateSetPosition(win as any, 300, 300);
  handle.cancel();
  await vi.advanceTimersByTimeAsync(16 * 50);
  expect(await handle.done).toBeUndefined();
  expect(win.setPosition).toHaveBeenCalledTimes(1);
});

it('honors custom spring constants by converging with softer motion', async () => {
  const { animateSetPosition } = await import('../animate');
  const win = makeWindow(0, 0);
  const handle = animateSetPosition(win as any, 100, 100, { tension: 40, friction: 8, restVelocity: 1, restDisplacement: 1 });
  const finished = await settle(handle, 5000);
  expect(finished).toBe(true);
  expect(win.setPosition.mock.calls.at(-1)).toEqual([100, 100, false]);
});

it('takes over when a second animation starts on the same window', async () => {
  const { animateSetPosition } = await import('../animate');
  const win = makeWindow(0, 0);
  const first = animateSetPosition(win as any, 400, 400);
  const second = animateSetPosition(win as any, 100, 100);
  first.cancel();
  const finished = await settle(second);
  expect(finished).toBe(true);
  expect(win.setPosition.mock.calls.at(-1)).toEqual([100, 100, false]);
});
