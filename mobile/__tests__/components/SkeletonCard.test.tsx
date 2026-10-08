jest.mock('react-native', () => {
  const AnimatedMock = {
    View: 'AnimatedView',
    Value: jest.fn(() => ({ interpolate: jest.fn(() => ({ __opacity: true })) })),
    loop: jest.fn((animation: unknown) => ({ start: jest.fn(), stop: jest.fn() })),
    sequence: jest.fn((steps: unknown) => steps),
    timing: jest.fn(() => ({})),
  };
  return {
    __esModule: true,
    View: 'View',
    StyleSheet: { create: (value: unknown) => value },
    get Animated() { return AnimatedMock; },
  };
});
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));

import React from 'react';
import SkeletonCard from '../../src/components/SkeletonCard';

const { create, act } = require('react-test-renderer');
const RN: any = require('react-native');
const { THEMES } = require('../../src/theme/themes');

let tree: any;

beforeEach(() => jest.clearAllMocks());
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('SkeletonCard', () => {
  it('starts the pulse loop over an up/down sequence', async () => {
    await act(async () => { tree = create(<SkeletonCard />); });
    expect(RN.Animated.timing).toHaveBeenCalledTimes(2);
    expect(RN.Animated.timing).toHaveBeenNthCalledWith(1, expect.anything(), { toValue: 1, duration: 800, useNativeDriver: true });
    expect(RN.Animated.timing).toHaveBeenNthCalledWith(2, expect.anything(), { toValue: 0, duration: 800, useNativeDriver: true });
    expect(RN.Animated.sequence).toHaveBeenCalledTimes(1);
    const loop = RN.Animated.loop.mock.results[0]!.value;
    expect(loop.start).toHaveBeenCalledTimes(1);
  });

  it('interpolates the pulse into a 0.4-1 opacity range', async () => {
    await act(async () => { tree = create(<SkeletonCard />); });
    expect(RN.Animated.Value.mock.results[0]!.value.interpolate).toHaveBeenCalledWith({
      inputRange: [0, 1],
      outputRange: [0.4, 1],
    });
  });

  it('renders shimmer bars, tag chips, thumbnails and footer placeholders', async () => {
    await act(async () => { tree = create(<SkeletonCard />); });
    expect(tree.root.findAllByType('AnimatedView')).toHaveLength(10); // 4 text bars + 2 tags + 2 thumbs + 2 footer
    const card = tree.root.findAllByType('View')[0];
    expect(card.props.accessible).toBe(false);
    expect(card.props.accessibilityElementsHidden).toBe(true);
    expect(card.props.style.some((s: any) => s?.backgroundColor === THEMES[0].colors.cardBg)).toBe(true);
  });

  it('styles bars with rounded caps and theme placeholder color', async () => {
    await act(async () => { tree = create(<SkeletonCard />); });
    const shimmer = tree.root.findAllByType('AnimatedView')[0];
    const base = shimmer.props.style.find((s: any) => s?.backgroundColor === THEMES[0].colors.borderLight);
    expect(base.borderRadius).toBe(7); // height 14 / 2
    expect(base.width).toBe('90%');
  });

  it('stops the loop on unmount', async () => {
    await act(async () => { tree = create(<SkeletonCard />); });
    const loop = RN.Animated.loop.mock.results[0]!.value;
    act(() => { tree.unmount(); });
    tree = undefined;
    expect(loop.stop).toHaveBeenCalledTimes(1);
  });
});
