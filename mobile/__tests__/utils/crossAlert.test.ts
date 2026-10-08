jest.mock('react-native', () => {
  const state = { os: 'ios' as string | null | undefined };
  return {
    __esModule: true,
    Alert: { alert: jest.fn() },
    ActionSheetIOS: { showActionSheetWithOptions: jest.fn() },
    get Platform() {
      if (state.os === null) return undefined;
      return { get OS() { return state.os; } };
    },
    __state: state,
  };
});
jest.mock('../../src/utils/webAlert', () => ({
  webAlert: jest.fn(),
  webConfirm: jest.fn(),
  webActionSheet: jest.fn(),
}));

import { xAlert, xConfirm, xActionSheet } from '../../src/utils/crossAlert';

const RN: any = require('react-native');
const { Alert, ActionSheetIOS } = RN;
const { webAlert, webConfirm, webActionSheet } = require('../../src/utils/webAlert');

const enableWeb = (on: boolean) => {
  (global as any).window = on ? {} : undefined;
  (global as any).document = on ? {} : undefined;
};

beforeEach(() => {
  jest.clearAllMocks();
  RN.__state.os = 'ios';
  enableWeb(false);
});

afterEach(() => enableWeb(false));

describe('xAlert', () => {
  it('uses the native alert off web', () => {
    xAlert('标题', '内容');
    expect(Alert.alert).toHaveBeenCalledWith('标题', '内容');
    expect(webAlert).not.toHaveBeenCalled();
  });

  it('uses the web dialog on web with a dom', () => {
    RN.__state.os = 'web';
    enableWeb(true);
    xAlert('标题');
    expect(webAlert).toHaveBeenCalledWith('标题', undefined);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('falls back to the native alert on web without a dom', () => {
    RN.__state.os = 'web';
    xAlert('标题');
    expect(Alert.alert).toHaveBeenCalledWith('标题', undefined);
  });

  it('treats a missing platform as native', () => {
    RN.__state.os = undefined;
    xAlert('标题');
    expect(Alert.alert).toHaveBeenCalledWith('标题', undefined);
  });

  it('treats a nullish platform as native', () => {
    RN.__state.os = null;
    xAlert('标题');
    expect(Alert.alert).toHaveBeenCalledWith('标题', undefined);
  });
});

describe('xConfirm', () => {
  it('wires default buttons and forwards both callbacks', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    xConfirm('删除？', '确定删除这条记录吗', onConfirm, onCancel);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons: Array<{ text: string; style: string; onPress?: () => void }> = Alert.alert.mock.calls[0]![2];
    expect(buttons).toEqual([
      expect.objectContaining({ text: '取消', style: 'cancel' }),
      expect.objectContaining({ text: '确定', style: 'default' }),
    ]);
    buttons[1]!.onPress!();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    buttons[0]!.onPress!();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('honors custom texts and the destructive style', () => {
    xConfirm('清空', '全部清除', jest.fn(), jest.fn(), { confirmText: '清空', cancelText: '保留', destructive: true });
    const buttons: Array<{ text: string; style: string }> = Alert.alert.mock.calls[0]![2];
    expect(buttons).toEqual([
      expect.objectContaining({ text: '保留', style: 'cancel' }),
      expect.objectContaining({ text: '清空', style: 'destructive' }),
    ]);
  });

  it('delegates to the web confirm dialog', () => {
    RN.__state.os = 'web';
    enableWeb(true);
    const opts = { confirmText: '好' };
    xConfirm('标题', '内容', jest.fn(), undefined, opts);
    expect(webConfirm).toHaveBeenCalledWith('标题', '内容', expect.any(Function), undefined, opts);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('xActionSheet', () => {
  it('delegates to the web action sheet', () => {
    RN.__state.os = 'web';
    enableWeb(true);
    const onSelect = jest.fn();
    xActionSheet('操作', [{ text: '编辑' }], onSelect, '关闭');
    expect(webActionSheet).toHaveBeenCalledWith('操作', [{ text: '编辑' }], onSelect, '关闭');
  });

  it('builds the ios sheet without a destructive index', () => {
    const onSelect = jest.fn();
    xActionSheet('操作', [{ text: '编辑' }, { text: '移动' }], onSelect);
    expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalledWith(
      {
        title: '操作',
        options: ['编辑', '移动', '取消'],
        destructiveButtonIndex: undefined,
        cancelButtonIndex: 2,
      },
      expect.any(Function),
    );
    const cb: (idx: number) => void = ActionSheetIOS.showActionSheetWithOptions.mock.calls[0]![1];
    cb(0);
    cb(1);
    cb(2); // cancel — must not select
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenNthCalledWith(1, 0);
    expect(onSelect).toHaveBeenNthCalledWith(2, 1);
  });

  it('marks the destructive option on ios', () => {
    xActionSheet('操作', [{ text: '编辑' }, { text: '删除', destructive: true }], jest.fn(), '不了');
    expect(ActionSheetIOS.showActionSheetWithOptions.mock.calls[0]![0]).toEqual({
      title: '操作',
      options: ['编辑', '删除', '不了'],
      destructiveButtonIndex: 1,
      cancelButtonIndex: 2,
    });
  });

  it('maps options onto an android alert', () => {
    RN.__state.os = 'android';
    const onSelect = jest.fn();
    xActionSheet('操作', [{ text: '编辑' }, { text: '删除', destructive: true }], onSelect);
    const buttons: Array<{ text: string; style: string; onPress: () => void }> = Alert.alert.mock.calls[0]![2];
    expect(buttons).toEqual([
      expect.objectContaining({ text: '编辑', style: 'default' }),
      expect.objectContaining({ text: '删除', style: 'destructive' }),
      expect.objectContaining({ text: '取消', style: 'cancel' }),
    ]);
    buttons[1]!.onPress();
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
