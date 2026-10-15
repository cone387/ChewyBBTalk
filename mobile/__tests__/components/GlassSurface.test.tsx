jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Platform: { OS: 'ios' },
  AccessibilityInfo: {
    isReduceTransparencyEnabled: jest.fn(async () => false),
    isReduceMotionEnabled: jest.fn(async () => false),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));
jest.mock('expo-glass-effect', () => ({
  GlassView: 'NativeGlass', isLiquidGlassAvailable: jest.fn(() => true),
  isGlassEffectAPIAvailable: jest.fn(() => true),
}));
jest.mock('expo-blur', () => ({ BlurView: 'Blur' }));

import React from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { isGlassEffectAPIAvailable } from 'expo-glass-effect';
import GlassSurface from '../../src/components/GlassSurface';
import { GlassPreferencesProvider } from '../../src/theme/GlassPreferences';
import { THEMES } from '../../src/theme/themes';
const { create, act } = require('react-test-renderer');
let tree: any;
const mount = async () => {
  await act(async () => { tree = create(<GlassPreferencesProvider><GlassSurface theme={THEMES[0]} testID="surface">Content</GlassSurface></GlassPreferencesProvider>); });
};
beforeEach(() => {
  jest.clearAllMocks(); (Platform as any).OS = 'ios';
  (AccessibilityInfo.isReduceTransparencyEnabled as jest.Mock).mockResolvedValue(false);
  (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(true);
});
afterEach(() => act(() => tree?.unmount()));

it('renders native glass only when the runtime supports it, without intercepting touches', async () => {
  await mount();
  expect(tree.root.findByType('NativeGlass').props.pointerEvents).toBe('none');
  expect(tree.root.findAllByType('Blur')).toHaveLength(0);
  expect(tree.root.findByProps({ testID: 'surface' }).props.children).toBe('Content');
});
it('uses blur when the native glass API is unavailable', async () => {
  (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
  await mount();
  expect(tree.root.findAllByType('NativeGlass')).toHaveLength(0);
  expect(tree.root.findAllByType('Blur')).toHaveLength(1);
});
it('falls back safely when an older development build is missing the native module', async () => {
  (isGlassEffectAPIAvailable as jest.Mock).mockImplementation(() => { throw new Error('Cannot find native module ExpoGlassEffect'); });
  await mount();
  expect(tree.root.findAllByType('NativeGlass')).toHaveLength(0);
  expect(tree.root.findAllByType('Blur')).toHaveLength(1);
});
it('keeps surfaces opaque when reduce transparency is enabled, including changes while mounted', async () => {
  await mount();
  const listener = (AccessibilityInfo.addEventListener as jest.Mock).mock.calls.find(([name]: any) => name === 'reduceTransparencyChanged')[1];
  act(() => listener(true));
  expect(tree.root.findAllByType('NativeGlass')).toHaveLength(0);
  expect(tree.root.findAllByType('Blur')).toHaveLength(0);
  const views = tree.root.findAllByType('View');
  expect(views.some((v: any) => v.props.style?.backgroundColor === THEMES[0].colors.surface)).toBe(true);
});
it('does not load a native effect on Android', async () => {
  (Platform as any).OS = 'android'; await mount();
  expect(tree.root.findAllByType('NativeGlass')).toHaveLength(0);
  expect(tree.root.findAllByType('Blur')).toHaveLength(0);
});
it('defaults to an opaque surface outside the preference provider', () => {
  act(() => { tree = create(<GlassSurface theme={THEMES[1]}>Private</GlassSurface>); });
  expect(tree.root.findAllByType('NativeGlass')).toHaveLength(0);
  expect(tree.root.findAllByType('Blur')).toHaveLength(0);
});
