import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Drawer from '../src/components/ui/Drawer';

beforeEach(() => { document.body.style.overflow = ''; vi.clearAllMocks(); });
afterEach(() => { cleanup(); document.body.style.overflow = ''; });

describe('Drawer', () => {
  it('renders nothing while hidden and unlocks the body on close', () => {
    const onClose = vi.fn();
    const view = render(<Drawer visible={false} onClose={onClose}>内容</Drawer>);
    expect(view.container.querySelector('.fixed.inset-0')).toBeNull();
    expect(document.body.style.overflow).toBe('unset');
    view.unmount();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks scrolling while visible, closes via mask, header button and Escape', () => {
    const onClose = vi.fn();
    const view = render(
      <Drawer visible onClose={onClose} title="抽屉标题">
        <p>抽屉正文</p>
      </Drawer>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    const dialog = screen.getByText('抽屉标题').closest('div.fixed')!;
    fireEvent.click(screen.getByText('抽屉正文')); // content clicks do not close
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog.querySelector('.bg-black')!); // mask
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: 'Enter' }); // unrelated keys are ignored
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
    view.unmount();
    expect(document.body.style.overflow).toBe('unset');
  });

  it('ignores Escape while hidden', () => {
    const onClose = vi.fn();
    render(<Drawer visible={false} onClose={onClose}>内容</Drawer>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ['right', 'right-0', 'width', '20rem', 'translate-x-0'],
    ['left', 'left-0', 'width', '20rem', 'translate-x-0'],
    ['top', 'top-0', 'height', '12rem', 'translate-y-0'],
    ['bottom', 'bottom-0', 'height', '16rem', 'translate-y-0'],
  ] as const)('places the %s drawer inside the viewport', (position, anchor, axis, width, transform) => {
    render(
      <Drawer visible position={position} width={width} title={position} onClose={vi.fn()}>
        <p>正文</p>
      </Drawer>,
    );
    const panel = screen.getByText('正文').closest('div.absolute')!;
    expect(panel.className).toContain(anchor);
    expect(panel.className).toContain(transform);
    expect(panel.style[axis as 'width' | 'height']).toBe(width);
  });

  it('omits the header when no title is given', () => {
    render(<Drawer visible onClose={vi.fn()}>无标题内容</Drawer>);
    expect(screen.queryByRole('button', { name: '关闭' })).toBeNull();
    expect(screen.getByText('无标题内容')).toBeTruthy();
  });
});
