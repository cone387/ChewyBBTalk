jest.mock('react-native', () => {
  const AnimatedMock = {
    View: 'AnimatedView',
    Value: jest.fn(() => ({ setValue: jest.fn(), interpolate: jest.fn(() => ({ __scale: true })) })),
    spring: jest.fn(() => ({ start: jest.fn() })),
  };
  return {
    __esModule: true,
    View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
    StyleSheet: { create: (value: unknown) => value },
    get Animated() { return AnimatedMock; },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn() }));

import React from 'react';
import EmptyState from '../../src/components/EmptyState';

const { create, act } = require('react-test-renderer');
const RN: any = require('react-native');
const { useReducedMotion } = require('../../src/hooks/useReducedMotion');
const { THEMES } = require('../../src/theme/themes');

let tree: any;
const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
const text = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);

beforeEach(() => {
  jest.clearAllMocks();
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

async function mount(props: Parameters<typeof EmptyState>[0]) {
  await act(async () => { tree = create(<EmptyState {...props} />); });
}

describe('EmptyState appearance', () => {
  it('renders the icon, title and hint with the theme primary color', async () => {
    await mount({ icon: 'calendar-outline', title: '还没有记录', hint: '写下第一条吧' });
    const icon = tree.root.findByType('Icon');
    expect(icon.props.name).toBe('calendar-outline');
    expect(icon.props.color).toBe(THEMES[0].colors.primary);
    expect(text('还没有记录')).toBe(true);
    expect(text('写下第一条吧')).toBe(true);
    const circle = tree.root.findAllByType('View')[0];
    expect(circle.props.style.some((s: any) => s?.backgroundColor === THEMES[0].colors.primary + '12')).toBe(true);
  });

  it('accepts a custom icon color and hides the hint when absent', async () => {
    await mount({ icon: 'flag', iconColor: '#ff0000', title: '空的' });
    expect(tree.root.findByType('Icon').props.color).toBe('#ff0000');
    expect(tree.root.findAllByType('Text')).toHaveLength(1);
  });

  it('springs in when motion is allowed', async () => {
    await mount({ icon: 'flag', title: '空的' });
    expect(RN.Animated.spring).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 1, speed: 12, bounciness: 6, useNativeDriver: true }),
    );
  });

  it('skips the spring under reduced motion', async () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    await mount({ icon: 'flag', title: '空的' });
    expect(RN.Animated.Value.mock.results[0]!.value.setValue).toHaveBeenCalledWith(1);
    expect(RN.Animated.spring).not.toHaveBeenCalled();
  });
});

describe('EmptyState actions', () => {
  it('fires the primary action', async () => {
    const onAction = jest.fn();
    await mount({ icon: 'flag', title: '空的', actionLabel: '去创作', onAction });
    const btn = tree.root.findAllByType('TouchableOpacity')
      .find((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children) === '去创作'))!;
    await act(async () => { void btn.props.onPress(); });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(text('去创作')).toBe(true);
  });

  it('omits the primary action without a callback', async () => {
    await mount({ icon: 'flag', title: '空的', actionLabel: '去创作' });
    expect(tree.root.findAllByType('TouchableOpacity')).toHaveLength(0);
  });

  it('fires the secondary action', async () => {
    const onSecondaryAction = jest.fn();
    await mount({ icon: 'flag', title: '空的', secondaryActionLabel: '了解详情', onSecondaryAction });
    const btn = tree.root.findByType('TouchableOpacity');
    expect(btn.props.accessibilityRole).toBe('button');
    await act(async () => { void btn.props.onPress(); });
    expect(onSecondaryAction).toHaveBeenCalledTimes(1);
    expect(text('了解详情')).toBe(true);
  });
});
