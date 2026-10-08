jest.mock('react-native', () => {
  const listeners: Array<(state: string) => void> = [];
  const state = { os: 'ios' };
  return {
    __esModule: true,
    View: 'View',
    StyleSheet: { create: (value: unknown) => value, absoluteFill: { __fill: true }, absoluteFillObject: {} },
    AppState: {
      addEventListener: jest.fn((_event: string, cb: (state: string) => void) => {
        listeners.push(cb);
        return { remove: jest.fn() };
      }),
    },
    get Platform() { return { get OS() { return state.os; } }; },
    __state: state,
    __listeners: listeners,
  };
});
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));

import React from 'react';
import AppBackgroundBlur from '../../src/components/AppBackgroundBlur';

const { create, act } = require('react-test-renderer');
const RN: any = require('react-native');

let tree: any;
const fire = (state: string) => act(async () => {
  for (const cb of [...RN.__listeners]) cb(state);
});

async function mount() {
  await act(async () => { tree = create(<AppBackgroundBlur />); });
}

beforeEach(() => {
  jest.clearAllMocks();
  RN.__state.os = 'ios';
  RN.__listeners.length = 0;
});
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('AppBackgroundBlur', () => {
  it('stays hidden while the app is active on ios', async () => {
    await mount();
    expect(RN.AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(tree.root.findAllByType('View')).toHaveLength(0);
    await fire('active');
    expect(tree.root.findAllByType('View')).toHaveLength(0);
  });

  it('blurs over the app when switching away', async () => {
    await mount();
    await fire('inactive');
    expect(tree.root.findByType('BlurView').props.intensity).toBe(80);
    expect(tree.root.findByType('Icon').props.name).toBe('lock-closed');
    await fire('active');
    expect(tree.root.findAllByType('View')).toHaveLength(0);
  });

  it('blurs when the app fully backgrounds', async () => {
    await mount();
    await fire('background');
    expect(tree.root.findByType('BlurView')).toBeDefined();
  });

  it('does not subscribe off ios', async () => {
    RN.__state.os = 'android';
    await mount();
    expect(RN.AppState.addEventListener).not.toHaveBeenCalled();
    expect(tree.root.findAllByType('View')).toHaveLength(0);
  });

  it('keeps the blur off ios even if state flips', async () => {
    RN.__state.os = 'android';
    await mount();
    RN.__state.os = 'ios';
    await fire('background'); // no listener was ever registered on android
    expect(tree.root.findAllByType('View')).toHaveLength(0);
  });

  it('unsubscribes on unmount', async () => {
    await mount();
    const sub = RN.AppState.addEventListener.mock.results[0]!.value;
    act(() => { tree.unmount(); });
    tree = undefined;
    expect(sub.remove).toHaveBeenCalledTimes(1);
  });
});
