jest.mock('react-native', () => {
  const state = { os: 'ios' };
  return {
    __esModule: true,
    View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', TextInput: 'TextInput',
    ActivityIndicator: 'ActivityIndicator', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView',
    StyleSheet: { create: (value: unknown) => value, absoluteFillObject: {} },
    Keyboard: { dismiss: jest.fn() },
    get Platform() { return { get OS() { return state.os; } }; },
    get Animated() { return { View: 'AnimatedView', Value: jest.fn() }; },
    __state: state,
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../../src/screens/ComposeScreen', () => ({ __esModule: true, default: 'ComposeScreen' }));

import React from 'react';
import PrivacyLockOverlay from '../../src/components/PrivacyLockOverlay';
import { THEMES } from '../../src/theme/themes';

const { create, act } = require('react-test-renderer');
const RN: any = require('react-native');
const { Keyboard } = require('react-native');

let tree: any;
const settle = async (rounds = 2) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
};

const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
const tappable = (label: string) => tree.root.findAllByType('TouchableOpacity')
  .find((n: any) => n.props.accessibilityLabel === label);
const passwordInput = () => tree.root.findAllByType('TextInput')
  .find((n: any) => n.props.accessibilityLabel === '解锁密码');

type Overrides = Partial<Parameters<typeof PrivacyLockOverlay>[0] & { onUnlock: any; onBiometricUnlock: any }>;
function props(over: Overrides = {}) {
  return {
    locked: true,
    biometricAvailable: true,
    allowComposeWhenLocked: false,
    unlockPassword: '',
    unlocking: false,
    lockKeyboardH: {} as any,
    onUnlockPasswordChange: jest.fn(),
    onUnlock: jest.fn(async () => undefined),
    onBiometricUnlock: jest.fn(async () => 'unlocked' as const),
    onCompose: jest.fn(),
    onVoiceRecord: jest.fn(),
    bottomInset: 34,
    theme: THEMES[0],
    ...over,
  };
}

async function mount(p: ReturnType<typeof props>) {
  await act(async () => { tree = create(<PrivacyLockOverlay {...(p as any)} />); });
  await settle();
}

beforeEach(() => {
  jest.clearAllMocks();
  RN.__state.os = 'ios';
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('privacy lock overlay (compose disabled)', () => {
  it('shows the biometric option on iOS and forwards the unlock request', async () => {
    const p = props();
    await mount(p);
    expect(hasText('内容已锁定')).toBe(true);
    expect(hasText('或使用密码')).toBe(true);
    const bio = tappable('使用 Face ID 或 Touch ID 解锁')!;
    expect(bio).toBeDefined();
    await act(async () => { void bio.props.onPress(); });
    expect(p.onBiometricUnlock).toHaveBeenCalledTimes(1);
  });

  it('uses android labels off iOS', async () => {
    RN.__state.os = 'android';
    const p = props();
    await mount(p);
    expect(tappable('使用指纹解锁')).toBeDefined();
    expect(hasText('指纹解锁')).toBe(true);
  });

  it('hides the biometric option when unavailable', async () => {
    const p = props({ biometricAvailable: false });
    await mount(p);
    expect(tree.root.findAllByType('TouchableOpacity').some((n: any) => n.props.accessibilityLabel?.includes('解锁') && n.props.accessibilityLabel !== '密码解锁')).toBe(false);
    expect(hasText('或使用密码')).toBe(false);
  });

  it('forwards password input and unlocks on submit', async () => {
    const p = props({ unlockPassword: 'pw' });
    await mount(p);
    const input = tree.root.findAllByType('TextInput').find((n: any) => !n.props.accessibilityLabel)!;
    await act(async () => { void input.props.onChangeText('pw'); });
    expect(p.onUnlockPasswordChange).toHaveBeenCalledWith('pw');
    await act(async () => { void input.props.onSubmitEditing(); });
    expect(p.onUnlock).toHaveBeenCalledTimes(1);
  });

  it('disables the unlock button until a password is present', async () => {
    const p = props();
    await mount(p);
    const button = tappable('密码解锁')!;
    expect(button.props.disabled).toBe(true);
    expect(button.props.style.some((s: any) => s?.opacity === 0.5)).toBe(true);

    await mount(props({ unlockPassword: 'pw' }));
    expect(tappable('密码解锁')!.props.disabled).toBe(false);
  });

  it('shows a spinner while unlocking', async () => {
    await mount(props({ unlocking: true, unlockPassword: 'pw' }));
    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(1);
    expect(tappable('密码解锁')!.props.disabled).toBe(true);
  });

  it('renders nothing when unlocked', async () => {
    await mount(props({ locked: false }));
    expect(tree.root.findAllByType('View')).toHaveLength(0);
  });
});

describe('locked composer (compose allowed)', () => {
  const composeProps = () => tree.root.findByType('ComposeScreen').props;

  it('embeds the compose screen with the unlock request hook', async () => {
    const p = props({ allowComposeWhenLocked: true });
    await mount(p);
    expect(composeProps().lockedCapture).toBe(true);
    expect(typeof composeProps().onRequestUnlock).toBe('function');
  });

  it('opens the password dialog when biometrics are unavailable', async () => {
    const p = props({ allowComposeWhenLocked: true, biometricAvailable: false });
    await mount(p);
    await act(async () => { await composeProps().onRequestUnlock(); });
    expect(p.onBiometricUnlock).not.toHaveBeenCalled();
    expect(tree.root.findByType('Modal').props.visible).toBe(true);
    expect(passwordInput()).toBeDefined();
  });

  it('shows the dialog when biometrics fall back to the password', async () => {
    const p = props({ allowComposeWhenLocked: true, onBiometricUnlock: jest.fn(async () => 'password' as const) });
    await mount(p);
    await act(async () => { await composeProps().onRequestUnlock(); });
    expect(p.onBiometricUnlock).toHaveBeenCalledTimes(1);
    expect(tree.root.findByType('Modal').props.visible).toBe(true);
  });

  it('stays quiet when biometrics succeed', async () => {
    const p = props({ allowComposeWhenLocked: true, onBiometricUnlock: jest.fn(async () => 'unlocked' as const) });
    await mount(p);
    await act(async () => { await composeProps().onRequestUnlock(); });
    expect(tree.root.findByType('Modal').props.visible).toBe(false);
  });

  it('ignores repeated unlock requests while one is in flight', async () => {
    let resolveAttempt!: (v: 'password' | 'unlocked') => void;
    const p = props({
      allowComposeWhenLocked: true,
      onBiometricUnlock: jest.fn(() => new Promise((resolve) => { resolveAttempt = resolve; })),
    });
    await mount(p);
    await act(async () => { void composeProps().onRequestUnlock(); });
    await act(async () => { void composeProps().onRequestUnlock(); });
    expect(p.onBiometricUnlock).toHaveBeenCalledTimes(1);
    await act(async () => { resolveAttempt('password'); });
    await settle();
    expect(tree.root.findByType('Modal').props.visible).toBe(true);
  });

  it('dismisses the keyboard, clears the password and closes on cancel', async () => {
    const p = props({ allowComposeWhenLocked: true, biometricAvailable: false, unlockPassword: 'pw' });
    await mount(p);
    await act(async () => { await composeProps().onRequestUnlock(); });
    await act(async () => { void tappable('取消认证')!.props.onPress(); });
    expect(Keyboard.dismiss).toHaveBeenCalled();
    expect(p.onUnlockPasswordChange).toHaveBeenCalledWith('');
    expect(tree.root.findByType('Modal').props.visible).toBe(false);
  });

  it('keeps the dialog open while unlocking', async () => {
    const p = props({ allowComposeWhenLocked: true, biometricAvailable: false, unlocking: true });
    await mount(p);
    await act(async () => { await composeProps().onRequestUnlock(); });
    await act(async () => { void tappable('取消认证')!.props.onPress(); });
    expect(tree.root.findByType('Modal').props.visible).toBe(true);

    const input = passwordInput()!;
    expect(input.props.editable).toBe(false);
    await act(async () => { void input.props.onSubmitEditing(); });
    expect(p.onUnlock).not.toHaveBeenCalled();
  });

  it('closes through the modal back request', async () => {
    const p = props({ allowComposeWhenLocked: true, biometricAvailable: false });
    await mount(p);
    await act(async () => { await composeProps().onRequestUnlock(); });
    await act(async () => { void tree.root.findByType('Modal').props.onRequestClose(); });
    expect(tree.root.findByType('Modal').props.visible).toBe(false);
  });

  it('submits the password and unlocks from the dialog', async () => {
    const p = props({ allowComposeWhenLocked: true, biometricAvailable: false, unlockPassword: 'pw' });
    await mount(p);
    await act(async () => { await composeProps().onRequestUnlock(); });

    const input = passwordInput()!;
    await act(async () => { void input.props.onChangeText('pw2'); });
    expect(p.onUnlockPasswordChange).toHaveBeenCalledWith('pw2');

    const unlock = tappable('密码解锁')!;
    expect(unlock.props.disabled).toBe(false);
    await act(async () => { void unlock.props.onPress(); });
    expect(p.onUnlock).toHaveBeenCalledTimes(1);
  });
});
