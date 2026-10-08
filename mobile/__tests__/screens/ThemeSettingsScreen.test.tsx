jest.mock('react-native', () => ({
  __esModule: true,
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }));
jest.mock('../../src/theme/ThemeContext', () => ({
  useTheme: () => mockThemeContext,
  THEMES: require('../../src/theme/themes').THEMES,
}));

import React from 'react';
import ThemeSettingsScreen from '../../src/screens/ThemeSettingsScreen';

const { create, act } = require('react-test-renderer');
const { THEMES } = require('../../src/theme/themes');

const mockThemeContext: { theme: any; setThemeKey: jest.Mock; themePreference: string } = {
  theme: THEMES[0],
  setThemeKey: jest.fn(),
  themePreference: 'system',
};

let tree: any;
const childText = (children: any): string =>
  typeof children === 'string' ? children
    : Array.isArray(children) ? children.map(childText).join('')
      : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
const themeCard = (name: string) => tree.root.findAllByType('TouchableOpacity')
  .find((n: any) => n.props.accessibilityLabel === `${name}主题`);
const systemCard = () => tree.root.findAllByType('TouchableOpacity')
  .find((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children) === '跟随系统'))!;

async function mount() {
  await act(async () => { tree = create(<ThemeSettingsScreen />); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockThemeContext.theme = THEMES[0];
  mockThemeContext.themePreference = 'system';
});
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('ThemeSettingsScreen', () => {
  it('lists the system option and every theme', async () => {
    await mount();
    expect(hasText('选择你喜欢的主题风格')).toBe(true);
    expect(hasText('随设备自动切换浅色与深色')).toBe(true);
    expect(systemCard()).toBeDefined();
    for (const t of THEMES) {
      expect(hasText(t.name)).toBe(true);
      expect(themeCard(t.name)).toBeDefined();
    }
  });

  it('marks the system card selected and follows the system on tap', async () => {
    await mount();
    const card = systemCard();
    expect(card.props.accessibilityState).toEqual({ selected: true });
    expect(card.findAllByType('Icon').some((i: any) => i.props.name === 'checkmark-circle')).toBe(true);
    await act(async () => { void card.props.onPress(); });
    expect(mockThemeContext.setThemeKey).toHaveBeenCalledWith('system');
  });

  it('flags the active theme with a thick border and checkmark', async () => {
    mockThemeContext.themePreference = THEMES[0].key;
    await mount();
    const active = themeCard(THEMES[0].name)!;
    expect(active.props.accessibilityState).toEqual({ selected: true });
    expect(active.props.style.some((s: any) => s?.borderWidth === 2)).toBe(true);
    expect(active.findAllByType('Icon').some((i: any) => i.props.name === 'checkmark-circle')).toBe(true);

    const other = themeCard(THEMES[1].name)!;
    expect(other.props.accessibilityState).toEqual({ selected: false });
    expect(other.props.style.some((s: any) => s?.borderWidth === 1)).toBe(true);
    expect(other.findAllByType('Icon').some((i: any) => i.props.name === 'checkmark-circle')).toBe(false);
  });

  it('switches to a theme on tap', async () => {
    await mount();
    await act(async () => { void themeCard(THEMES[1].name)!.props.onPress(); });
    expect(mockThemeContext.setThemeKey).toHaveBeenCalledWith(THEMES[1].key);
  });

  it('previews theme colors', async () => {
    await mount();
    const card = themeCard(THEMES[0].name)!;
    const dots = card.findAllByType('View')
      .filter((n: any) => n.props.style?.some?.((s: any) => s?.width === 18 && s?.height === 18));
    expect(dots).toHaveLength(4);
    const colors = dots.map((d: any) => d.props.style.find((s: any) => s?.backgroundColor).backgroundColor);
    expect(colors).toEqual([
      THEMES[0].colors.primary,
      THEMES[0].colors.accent,
      THEMES[0].colors.background,
      THEMES[0].colors.text,
    ]);
  });
});
