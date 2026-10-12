import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImagePreview from '../src/components/ImagePreview';

const cache = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../src/services/cache/imageCache', () => ({ imageCacheService: { getOrFetch: cache.fetch } }));

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(window.URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true });
  Object.defineProperty(window.URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  document.body.style.overflow = '';
  cache.fetch.mockResolvedValue(new Blob(['image-bytes']));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function preview(overrides: { src?: string; alt?: string } = {}) {
  const onClose = vi.fn();
  const view = render(<ImagePreview src={overrides.src ?? '/media/a.png'} alt={overrides.alt ?? '照片'} onClose={onClose} />);
  return { ...view, onClose };
}
function stage() {
  return document.querySelector('.touch-none') as HTMLElement;
}
function image() {
  return screen.getByRole('img') as HTMLImageElement;
}
const touch = (x: number, y: number) => ({ clientX: x, clientY: y, identifier: 1 });

describe('loading states', () => {
  it('shows a pending status, then renders the cached blob as an object URL', async () => {
    const blob = new Blob(['data']);
    cache.fetch.mockResolvedValue(blob);
    const view = preview();
    expect(screen.getByRole('status').textContent).toBe('加载图片…');
    expect(cache.fetch).toHaveBeenCalledWith('/media/a.png', false);
    await waitFor(() => expect(view.container.querySelector('img')).toBeTruthy());
    expect(image().getAttribute('src')).toBe('blob:mock');
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);
    view.unmount();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('offers a retry after a failed fetch and forces a refresh on the second attempt', async () => {
    cache.fetch.mockRejectedValueOnce(new Error('offline'));
    preview();
    fireEvent.click(await screen.findByRole('button', { name: '加载失败，重试' }));
    await waitFor(() => expect(cache.fetch).toHaveBeenCalledTimes(2));
    expect(cache.fetch).toHaveBeenLastCalledWith('/media/a.png', true);
    await waitFor(() => expect(screen.getByRole('img')).toBeTruthy());
  });

  it('treats an empty cache answer as a failure', async () => {
    cache.fetch.mockResolvedValue(null);
    preview();
    expect(await screen.findByRole('button', { name: '加载失败，重试' })).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('reloads when the source prop changes', async () => {
    const { rerender } = preview();
    await screen.findByRole('img');
    rerender(<ImagePreview src="/media/b.png" alt="照片" onClose={vi.fn()} />);
    await waitFor(() => expect(cache.fetch).toHaveBeenLastCalledWith('/media/b.png', false));
  });
});

describe('closing', () => {
  it('cycles a gallery by buttons and keyboard while keeping focus inside the dialog', async () => {
    const onClose = vi.fn();
    render(<ImagePreview src="/media/b.png" alt="fallback" images={[
      { src: '/media/a.png', alt: '第一张' }, { src: '/media/b.png', alt: '第二张' },
    ]} onClose={onClose} />);
    expect(await screen.findByRole('img', { name: '第二张' })).toBeTruthy();
    expect(screen.getByText('2 / 2')).toBeTruthy();
    const close = screen.getByRole('button', { name: '关闭图片预览' });
    const next = screen.getByRole('button', { name: '下一张图片' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(next);
    fireEvent.keyDown(next, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.click(next);
    expect(await screen.findByRole('img', { name: '第一张' })).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '上一张图片' }));
    expect(await screen.findByRole('img', { name: '第二张' })).toBeTruthy();
    fireEvent.keyDown(close, { key: 'ArrowRight' });
    expect(await screen.findByRole('img', { name: '第一张' })).toBeTruthy();
    fireEvent.keyDown(close, { key: 'ArrowLeft' });
    expect(await screen.findByRole('img', { name: '第二张' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape, backdrop click and the corner button, but not on the image stage', async () => {
    const view = preview();
    await screen.findByRole('img');
    fireEvent.click(stage());
    expect(view.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(view.onClose).toHaveBeenCalledWith();
    fireEvent.click(view.container.firstChild as Element);
    expect(view.onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button'));
    expect(view.onClose).toHaveBeenCalledTimes(3);
  });

  it('locks body scrolling while mounted and restores it afterwards', async () => {
    document.body.style.overflow = 'scroll';
    const view = preview();
    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });
});

describe('zoom controls', () => {
  it('zooms with the mouse wheel within its clamps', async () => {
    const view = preview();
    await screen.findByRole('img');
    fireEvent.wheel(stage(), { deltaY: -100 });
    expect(screen.getByText('115%')).toBeTruthy();
    fireEvent.wheel(stage(), { deltaY: 100 });
    expect(screen.queryByText(/%/)).toBeNull();
    for (let i = 0; i < 30; i += 1) fireEvent.wheel(stage(), { deltaY: -100 });
    expect(screen.getByText('500%')).toBeTruthy();
    for (let i = 0; i < 40; i += 1) fireEvent.wheel(stage(), { deltaY: 100 });
    expect(screen.getByText('50%')).toBeTruthy();
    fireEvent.wheel(stage(), { deltaY: -100 });
    fireEvent.wheel(stage(), { deltaY: -100 });
    fireEvent.wheel(stage(), { deltaY: -100 });
    expect(screen.queryByText(/%/)).toBeNull();
    view.unmount();
  });

  it('pinches to zoom with two fingers', async () => {
    const view = preview();
    await screen.findByRole('img');
    fireEvent.touchStart(stage(), { touches: [touch(0, 0), { ...touch(100, 0), identifier: 2 }] });
    fireEvent.touchMove(stage(), { touches: [touch(0, 0), { ...touch(200, 0), identifier: 2 }] });
    expect(screen.getByText('200%')).toBeTruthy();
    fireEvent.touchMove(stage(), { touches: [touch(0, 0), { ...touch(1000, 0), identifier: 2 }] });
    expect(screen.getByText('500%')).toBeTruthy();
    fireEvent.touchMove(stage(), { touches: [touch(0, 0), { ...touch(20, 0), identifier: 2 }] });
    expect(screen.getByText('50%')).toBeTruthy();
    view.unmount();
  });

  it('double-taps to zoom in and back out', async () => {
    const view = preview();
    await screen.findByRole('img');
    fireEvent.touchStart(stage(), { touches: [touch(10, 10)] });
    fireEvent.touchEnd(stage(), { touches: [] });
    fireEvent.touchStart(stage(), { touches: [touch(10, 10)] });
    expect(screen.getByText('200%')).toBeTruthy();
    fireEvent.touchEnd(stage(), { touches: [] });
    fireEvent.touchStart(stage(), { touches: [touch(10, 10)] });
    fireEvent.touchEnd(stage(), { touches: [] });
    fireEvent.touchStart(stage(), { touches: [touch(10, 10)] });
    expect(screen.queryByText(/%/)).toBeNull();
    view.unmount();
  });

  it('auto-hides the gesture hint after a moment', async () => {
    vi.useFakeTimers();
    preview();
    expect(screen.getByText('双击缩放 · 下滑关闭')).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(3100); });
    expect(screen.queryByText('双击缩放 · 下滑关闭')).toBeNull();
  });
});

describe('dragging', () => {
  it('drags a zoomed image with the mouse and releases it', async () => {
    const view = preview();
    await screen.findByRole('img');
    fireEvent.wheel(stage(), { deltaY: -100 });
    fireEvent.mouseDown(stage(), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(stage(), { clientX: 140, clientY: 150 });
    expect(image().style.transform).toBe('translate(40px, 50px) scale(1.15)');
    fireEvent.mouseUp(stage());
    view.unmount();
  });

  it('drags a zoomed image with one finger', async () => {
    const view = preview();
    await screen.findByRole('img');
    fireEvent.touchStart(stage(), { touches: [touch(10, 10)] });
    fireEvent.touchEnd(stage(), { touches: [] });
    fireEvent.touchStart(stage(), { touches: [touch(10, 10)] }); // double-tap zoom to 200%
    fireEvent.touchEnd(stage(), { touches: [] });
    fireEvent.touchStart(stage(), { touches: [touch(100, 100)] });
    fireEvent.touchMove(stage(), { touches: [touch(140, 150)] });
    expect(image().style.transform).toBe('translate(40px, 50px) scale(2)');
    view.unmount();
  });

  it('closes after a long downward swipe and springs back after a short one', async () => {
    vi.useFakeTimers();
    const view = preview();
    await act(async () => { await Promise.resolve(); }); // let the cache promise settle
    fireEvent.touchStart(stage(), { touches: [touch(50, 100)] });
    fireEvent.touchMove(stage(), { touches: [touch(50, 260)] });
    fireEvent.touchEnd(stage(), { touches: [] });
    expect(view.onClose).toHaveBeenCalledTimes(1);
    // Wait out the double-tap window before the second gesture.
    await act(async () => { vi.advanceTimersByTime(400); });
    fireEvent.touchStart(stage(), { touches: [touch(50, 100)] });
    fireEvent.touchMove(stage(), { touches: [touch(50, 130)] });
    fireEvent.touchEnd(stage(), { touches: [] });
    expect(view.onClose).toHaveBeenCalledTimes(1);
    expect(image().style.transform).toBe('translate(0px, 0px) scale(1)');
    view.unmount();
  });

  it('springs an under-scaled pinch back to the center', async () => {
    const view = preview();
    await screen.findByRole('img');
    fireEvent.touchStart(stage(), { touches: [touch(0, 0), { ...touch(100, 0), identifier: 2 }] });
    fireEvent.touchMove(stage(), { touches: [touch(0, 0), { ...touch(40, 0), identifier: 2 }] }); // 50%
    fireEvent.touchEnd(stage(), { touches: [] });
    expect(image().style.transform).toBe('translate(0px, 0px) scale(1)');
    view.unmount();
  });
});
