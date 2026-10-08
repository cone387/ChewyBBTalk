/** @jest-environment jsdom */
jest.mock('react-native', () => ({ View: 'View' }));

import React, { act } from 'react';
import LandingScreen from '../../src/screens/LandingScreen.web';

// react-dom ships without bundled types in the mobile package; require it untyped.
const { createRoot } = require('react-dom/client') as { createRoot: (container: HTMLElement) => any };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: any;
let navigate: jest.Mock;
const sleep = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

const cdnScript = () => document.querySelector<HTMLScriptElement>('script[src="https://cdn.tailwindcss.com"]');
const landingRoot = () => container.querySelector<HTMLElement>('.landing-root');
const loader = () => container.querySelector<HTMLElement>('.landing-loader');

async function renderScreen(nav: any = { navigate }) {
  await act(async () => { root.render(<LandingScreen navigation={nav} />); });
}

// Mount once and finish the CDN load so the module-level "already injected"
// guard engages for the follow-up mounts other tests rely on.
async function mountLoadedPage(nav: any = { navigate }) {
  await renderScreen(nav);
  act(() => { cdnScript()!.onload?.(new Event('load')); });
  await act(async () => { root.unmount(); });
  container.remove();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

beforeEach(() => {
  jest.clearAllMocks();
  document.title = '';
  document.documentElement.style.scrollBehavior = '';
  delete (window as any).tailwind;
  // Reveal waits for the next animation frame; make it synchronous for determinism.
  (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
  navigate = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  (window as any).tailwind = {}; // lets any stray poll interval self-clear
  jest.useRealTimers();
});

describe('LandingScreen tailwind bootstrap', () => {
  it('injects styles and the CDN once, then reveals after load', async () => {
    await renderScreen();
    expect(document.title).toBe('BBTalk · 你的私人碎碎念空间');
    expect(document.querySelector('style')!.textContent).toContain('.landing-root');
    expect(cdnScript()).not.toBeNull();
    expect(document.documentElement.style.scrollBehavior).toBe('smooth');

    expect(landingRoot()!.getAttribute('data-tw-ready')).toBeNull();
    expect(loader()).not.toBeNull();
    expect(container.querySelectorAll('#faq details')).toHaveLength(5);
    expect(container.querySelectorAll('[data-nav-login]').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('BBTalk 收费吗？');

    act(() => { cdnScript()!.onload?.(new Event('load')); });
    expect(landingRoot()!.getAttribute('data-tw-ready')).toBe('1');
    expect(loader()!.classList.contains('is-hidden')).toBe(true);
    await sleep(460);
    expect(loader()).toBeNull();
  });

  it('reveals immediately when tailwind is already available', async () => {
    await mountLoadedPage();
    (window as any).tailwind = {};
    await renderScreen();
    expect(document.querySelectorAll('script[src="https://cdn.tailwindcss.com"]')).toHaveLength(1);
    expect(landingRoot()!.getAttribute('data-tw-ready')).toBe('1');
  });

  it('polls until tailwind appears on repeat visits', async () => {
    await mountLoadedPage();
    await renderScreen();
    expect(landingRoot()!.getAttribute('data-tw-ready')).toBeNull();
    setTimeout(() => { (window as any).tailwind = {}; }, 60);
    await sleep(250);
    expect(landingRoot()!.getAttribute('data-tw-ready')).toBe('1');
  });

  it('reveals through the 3s fallback when the CDN never loads', async () => {
    jest.useFakeTimers({ doNotFake: ['requestAnimationFrame'] }); // keep the sync rAF stub
    await act(async () => { root.render(<LandingScreen navigation={{ navigate }} />); });
    expect(landingRoot()!.getAttribute('data-tw-ready')).toBeNull();
    act(() => { jest.advanceTimersByTime(3000); });
    expect(landingRoot()!.getAttribute('data-tw-ready')).toBe('1');
  });
});

describe('LandingScreen click delegation', () => {
  it('routes data-nav-login clicks to the login screen', async () => {
    await renderScreen();
    const el = container.querySelector<HTMLElement>('[data-nav-login]')!;
    const notCanceled = el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(notCanceled).toBe(false);
    expect(navigate).toHaveBeenCalledWith('Login');

    container.querySelector<HTMLElement>('#faq h2')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('stops routing clicks after unmount', async () => {
    await renderScreen();
    const el = container.querySelector<HTMLElement>('[data-nav-login]')!;
    await act(async () => { root.unmount(); });
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).not.toHaveBeenCalled();
    expect(document.documentElement.style.scrollBehavior).toBe('');
  });

  it('tolerates a missing navigation prop', async () => {
    await renderScreen(undefined);
    const el = container.querySelector<HTMLElement>('[data-nav-login]')!;
    expect(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).not.toThrow();
  });
});
