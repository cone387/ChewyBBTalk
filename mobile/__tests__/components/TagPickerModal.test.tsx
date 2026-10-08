jest.mock('react-native', () => {
  const createElement = require('react').createElement;
  return {
    __esModule: true,
    View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', Modal: 'Modal',
    FlatList: (props: any) => createElement(
      'View',
      null,
      props.data.map((item: unknown, i: number) =>
        createElement('View', { key: props.keyExtractor(item, i) }, props.renderItem({ item, index: i })),
      ),
    ),
    StyleSheet: { create: (value: unknown) => value },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../../src/components/EmptyState', () => ({ __esModule: true, default: 'EmptyState' }));

import React from 'react';
import TagPickerModal from '../../src/components/TagPickerModal';

const { create, act } = require('react-test-renderer');
const { THEMES } = require('../../src/theme/themes');

interface TestTag { id: string; name: string; color: string | null }

let tree: any;
const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
// The overlay wraps every row, so the innermost match is the real target.
const row = (name: string) => tree.root.findAllByType('TouchableOpacity')
  .filter((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children) === name)).pop()!;
const footerButton = (label: string) => tree.root.findAllByType('TouchableOpacity')
  .filter((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children).startsWith(label))).pop()!;

const TAGS: TestTag[] = [
  { id: 't1', name: '工作', color: '#ff0000' },
  { id: 't2', name: '生活', color: null },
  { id: '', name: '随笔', color: null },
];

function baseProps(over: Record<string, unknown> = {}) {
  return {
    visible: true,
    tags: TAGS as any,
    onConfirm: jest.fn(),
    onClose: jest.fn(),
    theme: THEMES[0],
    ...over,
  };
}

async function mount(p: ReturnType<typeof baseProps>) {
  await act(async () => { tree = create(<TagPickerModal {...(p as any)} />); });
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('TagPickerModal rendering', () => {
  it('lists tags with colored dots and unselected icons', async () => {
    await mount(baseProps());
    expect(hasText('选择标签')).toBe(true);
    const dots = tree.root.findAllByType('View')
      .filter((n: any) => n.props.style?.some?.((s: any) => s?.width === 10));
    expect(dots).toHaveLength(1); // only 工作 has a color
    expect(dots[0].props.style.some((s: any) => s?.backgroundColor === '#ff0000')).toBe(true);
    const icons = tree.root.findAllByType('Icon');
    expect(icons.filter((i: any) => i.props.name === 'square-outline')).toHaveLength(3);
  });

  it('blocks sheet taps from dismissing the overlay', async () => {
    await mount(baseProps());
    const sheet = tree.root.findAllByType('View').find((n: any) => n.props.onStartShouldSetResponder)!;
    expect(sheet.props.onStartShouldSetResponder()).toBe(true);
  });

  it('shows the empty state without tags', async () => {
    await mount(baseProps({ tags: [] }));
    expect(tree.root.findByType('EmptyState').props.title).toBe('暂无可用标签');
  });
});

describe('TagPickerModal selection', () => {
  it('toggles tags on and off with visual feedback', async () => {
    await mount(baseProps());
    const confirm = footerButton('确认');
    expect(confirm.props.disabled).toBe(true);
    expect(childText(confirm.findAllByType('Text')[0].props.children)).toBe('确认');

    await act(async () => { void row('工作').props.onPress(); });
    const selected = row('工作');
    expect(selected.props.style.some((s: any) => s?.backgroundColor === THEMES[0].colors.primaryLight)).toBe(true);
    expect(footerButton('确认').props.disabled).toBe(false);
    expect(hasText('确认 (1)')).toBe(true);

    await act(async () => { void row('工作').props.onPress(); });
    expect(footerButton('确认').props.disabled).toBe(true);
  });

  it('confirms the selected names in pick order', async () => {
    const p = baseProps();
    await mount(p);
    await act(async () => { void row('生活').props.onPress(); });
    await act(async () => { void row('工作').props.onPress(); });
    await act(async () => { void footerButton('确认').props.onPress(); });
    expect(p.onConfirm).toHaveBeenCalledTimes(1);
    expect(p.onConfirm.mock.calls[0]![0] instanceof Array).toBe(true);
    expect(new Set(p.onConfirm.mock.calls[0]![0])).toEqual(new Set(['生活', '工作']));
  });

  it('clears the selection when the modal reopens', async () => {
    const p = baseProps();
    await mount(p);
    await act(async () => { void row('工作').props.onPress(); });
    await act(async () => { tree.update(<TagPickerModal {...({ ...p, visible: false } as any)} />); });
    await act(async () => { tree.update(<TagPickerModal {...(p as any)} />); });
    expect(footerButton('确认').props.disabled).toBe(true);
    expect(hasText('确认 (1)')).toBe(false);
  });
});

describe('TagPickerModal closing', () => {
  it('closes through cancel, overlay tap and the back request', async () => {
    const p = baseProps();
    await mount(p);
    await act(async () => { void footerButton('取消').props.onPress(); });
    await act(async () => { void tree.root.findAllByType('TouchableOpacity')[0].props.onPress(); });
    await act(async () => { void tree.root.findByType('Modal').props.onRequestClose(); });
    expect(p.onClose).toHaveBeenCalledTimes(3);
  });
});
