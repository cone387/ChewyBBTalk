jest.mock('react-native', () => {
  const state = { scheme: null as string | null };
  return {
    __esModule: true,
    Text: 'Text',
    Platform: { OS: 'ios' },
    Appearance: { setColorScheme: jest.fn() },
    useColorScheme: () => state.scheme,
    __state: state,
  };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => mockStoredTheme),
  setItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import { ThemeProvider, useTheme } from '../../src/theme/ThemeContext';
import { getDialogColorScheme } from '../../src/theme/dialogTheme';

const { create, act } = require('react-test-renderer');
const RN: any = require('react-native');
const AsyncStorage = require('@react-native-async-storage/async-storage');

let mockStoredTheme: string | null = null;

let tree: any;
const snapshot = () => {
  const text = tree.root.findAllByType('Text')[0]!.props.children as string;
  return text.split('|');
};

async function mount() {
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
  });
  await act(async () => { await Promise.resolve(); });
}

function Probe() {
  const { theme, themePreference } = useTheme();
  return <Text>{`${theme.key}|${themePreference}`}</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStoredTheme = null;
  RN.__state.scheme = null;
  RN.Platform.OS = 'ios';
});
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('ThemeProvider resolution', () => {
  it('defaults to the light theme under a null system scheme', async () => {
    await mount();
    expect(snapshot()).toEqual(['light', 'system']);
  });

  it('follows a dark system scheme', async () => {
    RN.__state.scheme = 'dark';
    await mount();
    expect(snapshot()).toEqual(['dark', 'system']);
  });

  it('follows a light system scheme', async () => {
    RN.__state.scheme = 'light';
    await mount();
    expect(snapshot()).toEqual(['light', 'system']);
  });

  it('restores a saved preference on mount', async () => {
    mockStoredTheme = 'dark';
    await mount();
    expect(snapshot()).toEqual(['dark', 'dark']);
    expect(getDialogColorScheme()).toBe('dark');
  });

  it('ignores an unknown saved preference', async () => {
    mockStoredTheme = 'neon';
    await mount();
    expect(snapshot()).toEqual(['light', 'system']);
  });

  it('survives storage read failures', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('locked'));
    await mount();
    expect(snapshot()).toEqual(['light', 'system']);
  });
});

describe('setThemeKey', () => {
  const holder: { set?: (key: string) => void } = {};

  function SetKeyProbe() {
    holder.set = useTheme().setThemeKey;
    return <Text>set-key-probe</Text>;
  }

  async function mountWithControl() {
    await act(async () => {
      tree = create(
        <ThemeProvider>
          <Probe />
          <SetKeyProbe />
        </ThemeProvider>,
      );
    });
    await act(async () => { await Promise.resolve(); });
  }

  it('switches theme and persists the key', async () => {
    await mountWithControl();
    await act(async () => { holder.set!('dark'); });
    expect(snapshot()).toEqual(['dark', 'dark']);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('bbtalk_theme_key', 'dark');
    expect(getDialogColorScheme()).toBe('dark');
    await act(async () => { holder.set!('system'); });
    expect(getDialogColorScheme()).toBe('light');
  });

  it('synchronizes UIKit appearance from preference and releases system following', async () => {
    await mountWithControl();
    expect(RN.Appearance.setColorScheme).toHaveBeenLastCalledWith(null);
    await act(async () => { holder.set!('dark'); });
    expect(RN.Appearance.setColorScheme).toHaveBeenLastCalledWith('dark');
    await act(async () => { holder.set!('rose'); });
    expect(RN.Appearance.setColorScheme).toHaveBeenLastCalledWith('light');
    RN.__state.scheme = 'dark';
    await act(async () => { holder.set!('system'); });
    expect(RN.Appearance.setColorScheme).toHaveBeenLastCalledWith(null);
    const calls = RN.Appearance.setColorScheme.mock.calls.length;
    RN.__state.scheme = 'light';
    await act(async () => { tree.update(<ThemeProvider><Probe /><SetKeyProbe /></ThemeProvider>); });
    expect(snapshot()).toEqual(['light', 'system']);
    expect(RN.Appearance.setColorScheme).toHaveBeenCalledTimes(calls);
  });

  it('restores the native default on unmount and leaves web appearance alone', async () => {
    mockStoredTheme = 'dark';
    await mountWithControl();
    expect(RN.Appearance.setColorScheme).toHaveBeenLastCalledWith('dark');
    act(() => tree.unmount());
    expect(RN.Appearance.setColorScheme).toHaveBeenLastCalledWith(null);
    RN.Appearance.setColorScheme.mockClear();
    RN.Platform.OS = 'web';
    await mountWithControl();
    expect(RN.Appearance.setColorScheme).not.toHaveBeenCalled();
  });

  it('reverts to system following', async () => {
    RN.__state.scheme = 'dark';
    mockStoredTheme = 'dark';
    await mountWithControl();
    await act(async () => { holder.set!('system'); });
    expect(snapshot()).toEqual(['dark', 'system']);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('bbtalk_theme_key', 'system');
  });

  it('rejects unknown keys without persisting', async () => {
    await mountWithControl();
    await act(async () => { holder.set!('neon'); });
    expect(snapshot()).toEqual(['light', 'system']);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('swallows persistence failures', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('readonly'));
    await mountWithControl();
    await act(async () => { holder.set!('dark'); });
    expect(snapshot()).toEqual(['dark', 'dark']);
  });
});
