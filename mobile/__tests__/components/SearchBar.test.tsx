jest.mock('react-native', () => ({
  __esModule: true,
  View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));

import React from 'react';
import SearchBar, { SearchInput } from '../../src/components/SearchBar';

const { create, act } = require('react-test-renderer');
const { THEMES } = require('../../src/theme/themes');

let tree: any;
const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);

function baseProps(over: Record<string, unknown> = {}) {
  return {
    visible: true,
    searchText: '',
    searchHistory: [],
    onSearchTextChange: jest.fn(),
    onSubmit: jest.fn(),
    onClearHistory: jest.fn(),
    onHistoryItemPress: jest.fn(),
    onClose: jest.fn(),
    theme: THEMES[0],
    ...over,
  };
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('SearchBar history panel', () => {
  it('renders nothing while hidden', async () => {
    const p = baseProps({ visible: false, searchHistory: ['a'] });
    await act(async () => { tree = create(<SearchBar {...(p as any)} />); });
    expect(tree.root.findAllByType('View')).toHaveLength(0);
  });

  it('lists history terms and forwards chip presses', async () => {
    const p = baseProps({ searchHistory: ['工作', '生活'] });
    await act(async () => { tree = create(<SearchBar {...(p as any)} />); });
    expect(hasText('最近搜索')).toBe(true);
    expect(hasText('工作')).toBe(true);
    expect(hasText('生活')).toBe(true);
    const chip = tree.root.findAllByType('TouchableOpacity')
      .find((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children) === '生活'))!;
    await act(async () => { void chip.props.onPress(); });
    expect(p.onHistoryItemPress).toHaveBeenCalledWith('生活');
  });

  it('clears the history on request', async () => {
    const p = baseProps({ searchHistory: ['工作'] });
    await act(async () => { tree = create(<SearchBar {...(p as any)} />); });
    const clear = tree.root.findAllByType('TouchableOpacity')
      .find((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children) === '清除'))!;
    await act(async () => { void clear.props.onPress(); });
    expect(p.onClearHistory).toHaveBeenCalledTimes(1);
  });

  it('hides the panel once the user typed or when history is empty', async () => {
    const typed = baseProps({ searchText: '工', searchHistory: ['工作'] });
    await act(async () => { tree = create(<SearchBar {...(typed as any)} />); });
    expect(tree.root.findAllByType('View')).toHaveLength(0);
    await act(() => { tree.unmount(); });
    tree = undefined;

    const empty = baseProps({ searchHistory: [] });
    await act(async () => { tree = create(<SearchBar {...(empty as any)} />); });
    expect(tree.root.findAllByType('View')).toHaveLength(0);
  });
});

describe('SearchInput', () => {
  const inputProps = (over: Record<string, unknown> = {}) => ({
    searchText: '关键词' as string,
    onSearchTextChange: jest.fn(),
    onSubmit: jest.fn(),
    theme: THEMES[0],
    ...over,
  });

  it('forwards text changes and submits the current term', async () => {
    const p = inputProps();
    await act(async () => { tree = create(<SearchInput {...(p as any)} />); });
    const input = tree.root.findByType('TextInput');
    expect(input.props.value).toBe('关键词');
    expect(input.props.autoFocus).toBe(true);
    await act(async () => { void input.props.onChangeText('新词'); });
    expect(p.onSearchTextChange).toHaveBeenCalledWith('新词');
    await act(async () => { void input.props.onSubmitEditing(); });
    expect(p.onSubmit).toHaveBeenCalledWith('关键词');
  });

  it('clears the term through the trailing button', async () => {
    const p = inputProps();
    await act(async () => { tree = create(<SearchInput {...(p as any)} />); });
    const clear = tree.root.findByType('TouchableOpacity');
    expect(clear.props.accessibilityLabel).toBe('清除搜索');
    await act(async () => { void clear.props.onPress(); });
    expect(p.onSearchTextChange).toHaveBeenCalledWith('');
  });

  it('hides the clear button for an empty term', async () => {
    await act(async () => { tree = create(<SearchInput {...(inputProps({ searchText: '' }) as any)} />); });
    expect(tree.root.findAllByType('TouchableOpacity')).toHaveLength(0);
  });
});
