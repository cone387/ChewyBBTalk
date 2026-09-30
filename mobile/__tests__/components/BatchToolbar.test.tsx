jest.mock('react-native', () => ({ View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (styles: unknown) => styles } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 12 }) }));
import React from 'react';
import BatchToolbar, { type BatchToolbarProps } from '../../src/components/BatchToolbar';
const { create, act } = require('react-test-renderer');
let tree: any;
function mount(overrides: Partial<BatchToolbarProps> = {}) {
  const props = { selectedCount: 1, totalCount: 2, isExecuting: false, progress: null,
    onSelectAll: jest.fn(), onDelete: jest.fn(), onChangeTags: jest.fn(), onChangeVisibility: jest.fn(), onClose: jest.fn(),
    theme: { colors: { primary: '#123456', border: '#aaaaaa', danger: '#ff0000' } }, ...overrides,
  } as unknown as BatchToolbarProps;
  act(() => { tree = create(<BatchToolbar {...props} />); }); return props;
}
afterEach(() => act(() => tree?.unmount()));
it('dispatches all batch action buttons and close through real component handlers', () => {
  const props = mount(); const touches = tree.root.findAllByType('TouchableOpacity');
  act(() => touches.forEach((touch: any) => touch.props.onPress()));
  for (const key of ['onClose', 'onSelectAll', 'onDelete', 'onChangeTags', 'onChangeVisibility'] as const) expect(props[key]).toHaveBeenCalledTimes(1);
});
it('disables modifying actions without a selection while allowing select all and close', () => {
  mount({ selectedCount: 0 }); const touches = tree.root.findAllByType('TouchableOpacity');
  expect(touches.map((touch: any) => touch.props.disabled)).toEqual([false, false, true, true, true]);
});
it('disables every action and shows progress while operations are executing', () => {
  mount({ isExecuting: true, progress: { done: 1, total: 2 } });
  expect(tree.root.findAllByType('TouchableOpacity').every((touch: any) => touch.props.disabled)).toBe(true);
  expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(1);
  expect(tree.root.findAllByType('Text').map((text: any) => text.props.children).flat().join('')).toContain('1/2');
});
it.each([0, 1, 2])('reflects the all-selected state for %s selected records', count => {
  mount({ selectedCount: count });
  expect(tree.root.findAllByType('Icon')[1].props.name).toBe(count === 2 ? 'checkbox' : 'checkbox-outline');
});
