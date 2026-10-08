jest.mock('react-native', () => {
  const AnimatedMock = {
    View: 'AnimatedView',
    Value: jest.fn(() => ({ setValue: jest.fn() })),
    spring: jest.fn(() => ({ start: jest.fn() })),
    timing: jest.fn(() => ({ start: jest.fn((cb?: () => void) => cb?.()) })),
  };
  return {
    __esModule: true,
    View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
    StyleSheet: { create: (value: unknown) => value },
    get Animated() { return AnimatedMock; },
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));

import React from 'react';
import UndoToast from '../../src/components/UndoToast';

const { create, act } = require('react-test-renderer');
const RN: any = require('react-native');

let tree: any;
const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  act(() => { tree?.unmount(); });
  tree = undefined;
  jest.useRealTimers();
});

async function mount(props: Partial<Parameters<typeof UndoToast>[0]> = {}) {
  await act(async () => {
    tree = create(<UndoToast visible onUndo={onUndo} onDismiss={onDismiss} {...props} />);
  });
}

const onUndo = jest.fn();
const onDismiss = jest.fn();

describe('UndoToast visibility', () => {
  it('slides in and shows the message with an undo action', async () => {
    await mount();
    expect(RN.Animated.spring).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ toValue: 0, useNativeDriver: true, friction: 8 }),
    );
    expect(hasText('已删除')).toBe(true);
    expect(hasText('撤销')).toBe(true);
  });

  it('renders nothing while hidden and resets the offset', async () => {
    await act(async () => {
      tree = create(<UndoToast visible={false} onUndo={onUndo} onDismiss={onDismiss} />);
    });
    expect(tree.root.findAllByType('AnimatedView')).toHaveLength(0);
    expect(RN.Animated.Value.mock.results[0]!.value.setValue).toHaveBeenCalledWith(100);
  });

  it('supports a custom message', async () => {
    await mount({ message: '记录已移除' });
    expect(hasText('记录已移除')).toBe(true);
  });
});

describe('UndoToast dismissal', () => {
  it('auto-dismisses after the duration', async () => {
    await mount({ duration: 3000 });
    await act(async () => { await jest.advanceTimersByTimeAsync(2999); });
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(1); });
    expect(RN.Animated.timing).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ toValue: 100, duration: 250 }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('clears the timer and slides out on undo', async () => {
    await mount({ duration: 3000 });
    await act(async () => { void tree.root.findAllByType('TouchableOpacity')[0]!.props.onPress(); });
    expect(onUndo).toHaveBeenCalledTimes(1);
    await act(async () => { await jest.advanceTimersByTimeAsync(5000); });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('cancels the pending dismissal on hide', async () => {
    await mount({ duration: 3000 });
    await act(async () => { tree.update(<UndoToast visible={false} onUndo={onUndo} onDismiss={onDismiss} />); });
    await act(async () => { await jest.advanceTimersByTimeAsync(5000); });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('cancels the pending dismissal on unmount', async () => {
    await mount({ duration: 3000 });
    act(() => { tree.unmount(); });
    tree = undefined;
    await act(async () => { await jest.advanceTimersByTimeAsync(5000); });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
