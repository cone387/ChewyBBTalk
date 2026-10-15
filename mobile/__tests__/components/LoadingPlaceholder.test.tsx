jest.mock('react-native', () => {
  const AnimatedMock = {
    View: 'AnimatedView',
    Value: jest.fn(() => ({ __value: true, setValue: jest.fn() })),
    timing: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
  };
  return {
    __esModule: true,
    View: 'View', ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: (value: unknown) => value },
    get Animated() { return AnimatedMock; },
  };
});
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/theme/GlassPreferences', () => ({ useGlassPreferences: jest.fn(() => ({ reduceMotion: false })) }));

import React from 'react';
import LoadingPlaceholder from '../../src/components/LoadingPlaceholder';

const { create, act } = require('react-test-renderer');
const RN: any = require('react-native');
const { THEMES } = require('../../src/theme/themes');

let tree: any;

beforeEach(() => { jest.clearAllMocks(); require('../../src/theme/GlassPreferences').useGlassPreferences.mockReturnValue({ reduceMotion: false }); });
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('LoadingPlaceholder', () => {
  it('appears without animation when reduced motion is enabled', async () => {
    require('../../src/theme/GlassPreferences').useGlassPreferences.mockReturnValue({ reduceMotion: true });
    await act(async () => { tree = create(<LoadingPlaceholder />); });
    expect(RN.Animated.timing).not.toHaveBeenCalled();
    expect(RN.Animated.Value.mock.results[0].value.setValue).toHaveBeenCalledWith(1);
  });
  it('fades in with a 200ms timing and shows the spinner', async () => {
    await act(async () => { tree = create(<LoadingPlaceholder />); });
    expect(RN.Animated.timing).toHaveBeenCalledWith(
      expect.anything(),
      { toValue: 1, duration: 200, useNativeDriver: true },
    );
    expect(RN.Animated.timing.mock.results[0]!.value.start).toHaveBeenCalledTimes(1);
    const spinner = tree.root.findByType('ActivityIndicator');
    expect(spinner.props.size).toBe('large');
    expect(spinner.props.color).toBe(THEMES[0].colors.primary);
    expect(tree.root.findByType('AnimatedView').props.style[1].opacity).toBe(RN.Animated.Value.mock.results[0]!.value);
  });
});
