/**
 * @jest-environment jsdom
 */
import { webAlert, webConfirm, webActionSheet } from '../../src/utils/webAlert';

// jsdom's rAF is timer-driven; run entrance animations synchronously instead.
beforeAll(() => {
  jest.useFakeTimers();
  (window as any).requestAnimationFrame = (cb: (t: number) => void) => { cb(0); return 0; };
});

afterEach(() => {
  jest.advanceTimersByTime(250);
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

const overlay = (fromEnd = 0): HTMLDivElement =>
  document.body.children[document.body.children.length - 1 - fromEnd] as HTMLDivElement;
const leafButtons = (root: Element): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>('div'))
    .filter((d) => d.style.cursor === 'pointer' && d.children.length === 0);
const button = (root: Element, text: string): HTMLElement => {
  const found = leafButtons(root).find((d) => d.textContent === text);
  if (!found) throw new Error(`button not found: ${text}`);
  return found;
};
const click = (el: HTMLElement) => el.click();
const pressKey = (key: string) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key }));
const tapBackdrop = (root: Element) =>
  root.dispatchEvent(new MouseEvent('mousedown'));
const removed = async (root: Element) => {
  jest.advanceTimersByTime(200);
  await Promise.resolve();
  return !document.body.contains(root);
};
const msgDivs = (root: Element) =>
  Array.from(root.querySelectorAll<HTMLElement>('div')).filter((d) => d.style.fontSize === '13px');

describe('webAlert', () => {
  it('renders a centered card with title, message and one bold button', () => {
    webAlert('提示', '内容已保存');
    const root = overlay();
    expect(root.style.position).toBe('fixed');
    expect(root.style.opacity).toBe('1');
    expect(root.textContent).toContain('提示');
    expect(root.textContent).toContain('内容已保存');
    expect(msgDivs(root)).toHaveLength(1);
    expect(button(root, '好的').style.fontWeight).toBe('600');
    expect(document.body.style.overflow).toBe('hidden');
    click(button(root, '好的'));
    expect(removed(root)).resolves.toBe(true);
    expect(document.body.style.overflow).toBe('');
  });

  it('omits the message block when no message is given', () => {
    webAlert('仅标题');
    const root = overlay();
    expect(root.textContent).toContain('仅标题');
    expect(msgDivs(root)).toHaveLength(0);
    pressKey('Enter');
    expect(removed(root)).resolves.toBe(true);
  });

  it('dismisses on Escape and ignores unrelated keys', () => {
    webAlert('提示', 'msg');
    const root = overlay();
    pressKey('a');
    expect(document.body.contains(root)).toBe(true);
    pressKey('Escape');
    expect(removed(root)).resolves.toBe(true);
  });
});

describe('webConfirm', () => {
  const callbacks = () => ({ onConfirm: jest.fn(), onCancel: jest.fn() });

  it('confirms with default button labels', async () => {
    const cb = callbacks();
    webConfirm('删除?', '确定要删除吗', cb.onConfirm, cb.onCancel);
    const root = overlay();
    expect(leafButtons(root).map((b) => b.textContent)).toEqual(['取消', '确定']);
    click(button(root, '确定'));
    expect(cb.onConfirm).toHaveBeenCalledTimes(1);
    expect(cb.onCancel).not.toHaveBeenCalled();
    expect(await removed(root)).toBe(true);
    expect(document.body.style.overflow).toBe('');
  });

  it('supports custom labels, destructive styling and the cancel path', () => {
    const cb = callbacks();
    webConfirm('清空', '将清空全部数据', cb.onConfirm, cb.onCancel, {
      confirmText: '清空', cancelText: '返回', destructive: true,
    });
    const root = overlay();
    const confirmBtn = button(root, '清空');
    expect(confirmBtn.style.color).toBe('rgb(255, 59, 48)');
    expect(confirmBtn.style.fontWeight).toBe('600');
    expect(button(root, '返回').style.color).toBe('rgb(0, 122, 255)');
    // A vertical hairline separates the two buttons.
    expect(Array.from(root.querySelectorAll('div')).some((d) => d.style.width === '0.5px')).toBe(true);

    click(button(root, '返回'));
    expect(cb.onCancel).toHaveBeenCalledTimes(1);
    expect(cb.onConfirm).not.toHaveBeenCalled();
  });

  it('cancels via Escape or a backdrop tap, but not taps on the card', async () => {
    const cb = callbacks();
    webConfirm('标题', '消息', cb.onConfirm, cb.onCancel);
    const root = overlay();
    const card = root.querySelector('[data-c="a"]') as HTMLElement;
    tapBackdrop(card);
    expect(cb.onCancel).not.toHaveBeenCalled();

    tapBackdrop(root);
    expect(cb.onCancel).toHaveBeenCalledTimes(1);
    expect(await removed(root)).toBe(true);

    webConfirm('标题', '消息', cb.onConfirm, cb.onCancel);
    pressKey('Escape');
    expect(cb.onCancel).toHaveBeenCalledTimes(2);
  });

  it('fires the confirm callback only once for repeated clicks', async () => {
    const cb = callbacks();
    webConfirm('标题', '消息', cb.onConfirm);
    const root = overlay();
    const confirmBtn = button(root, '确定');
    click(confirmBtn);
    click(confirmBtn);
    pressKey('Enter');
    expect(cb.onConfirm).toHaveBeenCalledTimes(1);
    expect(await removed(root)).toBe(true);
  });
});

describe('webActionSheet', () => {
  it('renders title, options with destructive marks and the cancel button', () => {
    const onSelect = jest.fn();
    webActionSheet('选择操作', [
      { text: '仅删除标签' },
      { text: '同时删除记录', destructive: true },
    ], onSelect);
    const root = overlay();
    // Sheet is bottom-anchored.
    expect(root.style.alignItems).toBe('flex-end');
    expect(root.textContent).toContain('选择操作');
    expect(button(root, '仅删除标签').style.color).toBe('rgb(0, 122, 255)');
    expect(button(root, '同时删除记录').style.color).toBe('rgb(255, 59, 48)');
    expect(button(root, '取消').style.fontWeight).toBe('600');
    // Options render above horizontal hairlines.
    expect(Array.from(root.querySelectorAll('div')).some((d) => d.style.height === '0.5px')).toBe(true);

    click(button(root, '同时删除记录'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('renders without a title and supports a custom cancel label', async () => {
    const onSelect = jest.fn();
    webActionSheet('', [{ text: '选项一' }], onSelect, '关闭');
    const root = overlay();
    expect(msgDivs(root)).toHaveLength(0);
    click(button(root, '关闭'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(await removed(root)).toBe(true);
  });

  it('dismisses via Escape or backdrop tap without selecting', async () => {
    const onSelect = jest.fn();
    webActionSheet('操作', [{ text: '选项一' }], onSelect);
    const root = overlay();
    tapBackdrop(root);
    expect(onSelect).not.toHaveBeenCalled();
    expect(await removed(root)).toBe(true);

    webActionSheet('操作', [{ text: '选项一' }], onSelect);
    pressKey('Escape');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('overlay stacking and theme', () => {
  it('stacks overlays with rising z-index and shares the body lock', async () => {
    webAlert('第一个');
    const first = overlay();

    webConfirm('第二个', 'msg', jest.fn());
    const second = overlay();
    // The z counter is module state, so only relative order is stable.
    expect(Number(second.style.zIndex)).toBeGreaterThan(Number(first.style.zIndex));
    expect(Number(first.style.zIndex)).toBeGreaterThanOrEqual(99999);
    expect(document.body.style.overflow).toBe('hidden');

    click(button(first, '好的'));
    jest.advanceTimersByTime(200);
    // One dialog remains open, so the body stays locked.
    expect(document.body.style.overflow).toBe('hidden');

    click(button(second, '取消'));
    expect(await removed(second)).toBe(true);
    expect(document.body.style.overflow).toBe('');
  });

  it('uses the dark palette when the system prefers dark', () => {
    const original = (window as any).matchMedia;
    (window as any).matchMedia = () => ({ matches: true });
    try {
      webAlert('夜间');
      const root = overlay();
      const card = root.querySelector('[data-c="a"]') as HTMLElement;
      expect(card.style.backgroundColor).toBe('rgba(44, 44, 46, 0.97)');
      expect(button(root, '好的').style.color).toBe('rgb(10, 132, 255)');
      click(button(root, '好的'));
    } finally {
      (window as any).matchMedia = original;
    }
  });

  it('applies hover feedback and detaches key handlers after removal', async () => {
    webAlert('悬停', 'msg');
    const root = overlay();
    const btn = button(root, '好的');
    btn.dispatchEvent(new MouseEvent('mouseenter'));
    expect(btn.style.backgroundColor).toBe('rgba(0, 0, 0, 0.04)');
    btn.dispatchEvent(new MouseEvent('mouseleave'));
    expect(btn.style.backgroundColor).toBe('transparent');

    click(btn);
    expect(await removed(root)).toBe(true);
    // The keydown listener is cleaned up by the MutationObserver; a stale
    // keypress must be a harmless no-op.
    pressKey('Enter');
    expect(document.body.children).toHaveLength(0);
  });
});
