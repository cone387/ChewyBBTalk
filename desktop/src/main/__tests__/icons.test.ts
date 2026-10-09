import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ isPackaged: false }));

vi.mock('electron', () => ({
  app: {
    get isPackaged() { return state.isPackaged; },
  },
}));

beforeEach(() => { vi.resetModules(); state.isPackaged = false; });
afterEach(() => { delete (process as { resourcesPath?: string }).resourcesPath; });

it('resolves development icons next to the source resources directory', async () => {
  const { appIconPath } = await import('../icons');
  const path = await import('node:path');
  const resolved = appIconPath('custom.png');
  expect(resolved.endsWith(path.join('resources', 'custom.png'))).toBe(true);
  const defaultName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  expect(appIconPath().endsWith(defaultName)).toBe(true);
});

it('resolves packaged icons from the runtime resources directory', async () => {
  state.isPackaged = true;
  (process as { resourcesPath?: string }).resourcesPath = '/packaged-resources';
  const { appIconPath } = await import('../icons');
  const resolved = appIconPath('icon.ico');
  expect(resolved.includes('packaged-resources')).toBe(true);
  expect(resolved.endsWith('icon.ico')).toBe(true);
});
