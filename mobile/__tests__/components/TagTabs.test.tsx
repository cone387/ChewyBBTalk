jest.mock('react-native', () => ({
  __esModule: true,
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  StyleSheet: { create: (value: unknown) => value },
}));

import React from 'react';
import TagTabs from '../../src/components/TagTabs';

const { create, act } = require('react-test-renderer');
const { THEMES } = require('../../src/theme/themes');

let tree: any;
const childText = (children: any): string =>
  typeof children === 'string' ? children
    : Array.isArray(children) ? children.map(childText).join('')
      : '';
const tab = (label: string) => tree.root.findAllByType('TouchableOpacity')
  .filter((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children) === label)).pop()!;

const TAGS = [
  { id: 't1', name: '工作' },
  { id: 't2', name: '生活' },
];

function baseProps(over: Record<string, unknown> = {}) {
  return {
    tags: TAGS as any,
    selectedTag: null as string | null,
    selectedDate: null as string | null,
    onSelectTag: jest.fn(),
    onResetAnim: jest.fn(),
    scrollRef: { current: null },
    theme: THEMES[0],
    ...over,
  };
}

async function mount(p: ReturnType<typeof baseProps>) {
  await act(async () => { tree = create(<TagTabs {...(p as any)} />); });
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('TagTabs', () => {
  it('marks the all-tab active with no tag or date filter', async () => {
    await mount(baseProps());
    const all = tab('全部');
    expect(all.props.accessibilityState).toEqual({ selected: true });
    expect(all.props.style.some((s: any) => s?.backgroundColor === THEMES[0].colors.primary)).toBe(true);
    expect(all.findAllByType('Text')[0].props.style.some((s: any) => s?.color === '#fff')).toBe(true);
    expect(tab('工作').props.accessibilityState).toEqual({ selected: false });
  });

  it('deactivates the all-tab while a date filter is active', async () => {
    await mount(baseProps({ selectedDate: '2026-10-08' }));
    expect(tab('全部').props.accessibilityState).toEqual({ selected: false });
  });

  it('selects a tag and clears the selection when pressed again', async () => {
    const p = baseProps();
    await mount(p);
    await act(async () => { void tab('工作').props.onPress(); });
    expect(p.onSelectTag).toHaveBeenNthCalledWith(1, 't1');
    expect(p.onResetAnim).toHaveBeenCalledTimes(1);

    await mount(baseProps({ selectedTag: 't1', onSelectTag: p.onSelectTag }));
    const active = tab('工作');
    expect(active.props.accessibilityState).toEqual({ selected: true });
    expect(active.props.style.some((s: any) => s?.backgroundColor === THEMES[0].colors.primary)).toBe(true);
    await act(async () => { void active.props.onPress(); });
    expect(p.onSelectTag).toHaveBeenNthCalledWith(2, null);
  });

  it('resets to all from the all-tab', async () => {
    const p = baseProps({ selectedTag: 't2' });
    await mount(p);
    await act(async () => { void tab('全部').props.onPress(); });
    expect(p.onSelectTag).toHaveBeenCalledWith(null);
    expect(p.onResetAnim).toHaveBeenCalledTimes(1);
  });

  it('forwards the scroll ref to the horizontal scroller', async () => {
    const p = baseProps();
    await mount(p);
    expect(tree.root.findByType('ScrollView').props.ref).toBe(p.scrollRef);
    expect(tree.root.findByType('ScrollView').props.horizontal).toBe(true);
  });
});
