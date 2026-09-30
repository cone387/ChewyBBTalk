jest.mock('react-native', () => ({ View: 'View', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: (styles: unknown) => styles } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../../src/components/BBTalkCard', () => 'BBTalkCard');
import React from 'react';
import SwipeableBBTalkCard, { type SwipeableBBTalkCardProps } from '../../src/components/SwipeableBBTalkCard';
const { create, act } = require('react-test-renderer');
const item = { id: 'record', content: 'body' };
let tree: any;
function mount(overrides: Partial<SwipeableBBTalkCardProps> = {}) {
  const props = {
    item, onDelete: jest.fn(), onTogglePin: jest.fn(), onMenu: jest.fn(), onEdit: jest.fn(),
    onToggleVisibility: jest.fn(), onImagePreview: jest.fn(), onLocationPress: jest.fn(), onComment: jest.fn(),
    onLongPress: jest.fn(), batchMode: false, selected: false, onSelect: jest.fn(), openSwipeRef: { current: null },
    theme: { colors: { primary: '#123456', border: '#aaaaaa' } }, ...overrides,
  } as unknown as SwipeableBBTalkCardProps;
  act(() => { tree = create(<SwipeableBBTalkCard {...props} />); });
  return props;
}
afterEach(() => { if (tree) act(() => tree.unmount()); });
it('wires long press to the real card and does not select on normal tap', () => {
  const props = mount(); const touch = tree.root.findByType('TouchableOpacity');
  act(() => touch.props.onLongPress());
  expect(props.onLongPress).toHaveBeenCalledWith(item);
  expect(touch.props.onPress).toBeUndefined();
  expect(tree.root.findAllByProps({ accessibilityRole: 'checkbox' })).toHaveLength(0);
});
it('shows a checkbox and selects the same record from either batch touch target', () => {
  const props = mount({ batchMode: true }); const touches = tree.root.findAllByType('TouchableOpacity');
  expect(touches[0].props.onLongPress).toBeUndefined();
  act(() => { touches[0].props.onPress(); touches[1].props.onPress(); });
  expect(props.onSelect).toHaveBeenCalledTimes(2);
  expect(props.onSelect).toHaveBeenLastCalledWith('record');
  expect(touches[1].props.accessibilityLabel).toBe('选中');
});
it('renders the selected checkbox state and its accessible action', () => {
  mount({ batchMode: true, selected: true });
  const checkbox = tree.root.findByProps({ accessibilityRole: 'checkbox' });
  expect(checkbox.props.accessibilityLabel).toBe('取消选中');
  expect(tree.root.findByType('Icon').props.name).toBe('checkmark');
});
it('passes the record, comment and callbacks through to the actual child boundary', () => {
  const props = mount(); const card = tree.root.findByType('BBTalkCard');
  for (const key of ['item', 'onMenu', 'onEdit', 'onToggleVisibility', 'onImagePreview', 'onLocationPress', 'onComment', 'theme'] as const) expect(card.props[key]).toBe(props[key]);
});
it('does not install obsolete record swipe gestures that conflict with tag navigation', () => {
  mount(); const touch = tree.root.findByType('TouchableOpacity');
  expect(touch.props.onPanResponderRelease).toBeUndefined();
  expect(touch.props.onMoveShouldSetResponder).toBeUndefined();
});
it('allows cards without a long-press handler', () => {
  mount({ onLongPress: undefined });
  expect(() => act(() => tree.root.findByType('TouchableOpacity').props.onLongPress())).not.toThrow();
});
