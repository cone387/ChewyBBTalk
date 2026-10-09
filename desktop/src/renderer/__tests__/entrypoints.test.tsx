import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installMiniDom, type MiniDom } from './miniDom';

vi.mock('../compose/ComposeWindow', async () => {
  const React = await import('react');
  return { ComposeWindow: () => React.createElement('div', null, 'compose-entry-marker') };
});
vi.mock('../ball/Ball', async () => {
  const React = await import('react');
  return { Ball: () => React.createElement('div', null, 'ball-entry-marker') };
});
vi.mock('../login/LoginWindow', async () => {
  const React = await import('react');
  return { LoginWindow: () => React.createElement('div', null, 'login-entry-marker') };
});
vi.mock('../settings/SettingsWindow', async () => {
  const React = await import('react');
  return { SettingsWindow: () => React.createElement('div', null, 'settings-entry-marker') };
});

let dom: MiniDom;
beforeEach(() => { vi.resetModules(); dom = installMiniDom(); });
afterEach(() => dom.restore());

async function mountRoot() {
  const root = dom.document.createElement('div');
  root.setAttribute('id', 'root');
  dom.document.body.appendChild(root);
  return root;
}

it.each([
  ['../compose/main', 'compose-entry-marker'],
  ['../ball/main', 'ball-entry-marker'],
  ['../login/main', 'login-entry-marker'],
  ['../settings/main', 'settings-entry-marker'],
] as const)('%s renders its window into #root', async (entry, marker) => {
  const root = await mountRoot();
  const { act } = await import('react');
  await act(async () => { await import(entry); });
  expect(root.textContent).toContain(marker);
});

it.each([
  ['../compose/main'],
  ['../ball/main'],
] as const)('%s fails fast when #root is missing', async (entry) => {
  await expect(import(entry)).rejects.toThrow('#root not found');
});
