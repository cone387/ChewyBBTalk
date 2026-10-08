jest.mock('react-native', () => ({
  __esModule: true,
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', Modal: 'Modal',
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../../src/utils/confirmPublicVisibility', () => ({ confirmPublicVisibility: jest.fn() }));

import React from 'react';
import VisibilityPickerModal from '../../src/components/VisibilityPickerModal';

const { create, act } = require('react-test-renderer');
const { THEMES } = require('../../src/theme/themes');
const { confirmPublicVisibility } = require('../../src/utils/confirmPublicVisibility');

let tree: any;
const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
// The overlay wraps every option, so the innermost match is the real target.
const option = (label: string) => tree.root.findAllByType('TouchableOpacity')
  .filter((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children) === label)).pop()!;

function baseProps(over: Record<string, unknown> = {}) {
  return {
    visible: true,
    onConfirm: jest.fn(),
    onClose: jest.fn(),
    theme: THEMES[0],
    ...over,
  };
}

async function mount(p: ReturnType<typeof baseProps>) {
  await act(async () => { tree = create(<VisibilityPickerModal {...(p as any)} />); });
}

beforeEach(() => {
  jest.clearAllMocks();
  (confirmPublicVisibility as jest.Mock).mockImplementation((cb: () => void) => cb());
});
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('VisibilityPickerModal rendering', () => {
  it('offers the three visibility options with descriptions', async () => {
    await mount(baseProps());
    expect(hasText('选择可见性')).toBe(true);
    expect(hasText('公开')).toBe(true);
    expect(hasText('所有人可见')).toBe(true);
    expect(hasText('私密')).toBe(true);
    expect(hasText('仅自己可见')).toBe(true);
    expect(hasText('好友')).toBe(true);
    expect(hasText('好友可见')).toBe(true);
    expect(tree.root.findAllByType('Icon').filter((i: any) => i.props.name === 'chevron-forward')).toHaveLength(3);
  });

  it('blocks sheet taps from dismissing the overlay', async () => {
    await mount(baseProps());
    const sheet = tree.root.findAllByType('View').find((n: any) => n.props.onStartShouldSetResponder)!;
    expect(sheet.props.onStartShouldSetResponder()).toBe(true);
  });
});

describe('VisibilityPickerModal selection', () => {
  it('routes public choices through the confirm guard', async () => {
    const p = baseProps();
    await mount(p);
    await act(async () => { void option('公开').props.onPress(); });
    expect(confirmPublicVisibility).toHaveBeenCalledTimes(1);
    expect(p.onConfirm).toHaveBeenCalledWith('public');
  });

  it('keeps the record private when the guard declines', async () => {
    (confirmPublicVisibility as jest.Mock).mockImplementation(() => undefined);
    const p = baseProps();
    await mount(p);
    await act(async () => { void option('公开').props.onPress(); });
    expect(p.onConfirm).not.toHaveBeenCalled();
  });

  it('selects private and friends directly', async () => {
    const p = baseProps();
    await mount(p);
    await act(async () => { void option('私密').props.onPress(); });
    await act(async () => { void option('好友').props.onPress(); });
    expect(confirmPublicVisibility).not.toHaveBeenCalled();
    expect(p.onConfirm).toHaveBeenNthCalledWith(1, 'private');
    expect(p.onConfirm).toHaveBeenNthCalledWith(2, 'friends');
  });
});

describe('VisibilityPickerModal closing', () => {
  it('closes through cancel, overlay tap and the back request', async () => {
    const p = baseProps();
    await mount(p);
    await act(async () => { void option('取消').props.onPress(); });
    await act(async () => { void tree.root.findAllByType('TouchableOpacity')[0].props.onPress(); });
    await act(async () => { void tree.root.findByType('Modal').props.onRequestClose(); });
    expect(p.onClose).toHaveBeenCalledTimes(3);
  });
});
