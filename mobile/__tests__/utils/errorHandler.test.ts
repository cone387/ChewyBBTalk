const mockSetStringAsync = jest.fn((..._args: any[]) => Promise.resolve(true));
const mockXConfirm = jest.fn();

jest.mock('expo-clipboard', () => ({
  __esModule: true,
  setStringAsync: (...args: any[]) => mockSetStringAsync(...args),
}));
jest.mock('../../src/utils/crossAlert', () => ({
  xConfirm: (...args: any[]) => mockXConfirm(...args),
  xAlert: jest.fn(),
}));

import { classifyError, showError, showErrorMessage, logError, ErrorType } from '../../src/utils/errorHandler';

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => { warnSpy.mockRestore(); });

describe('classifyError', () => {
  it.each([
    [new Error('Network request failed'), ErrorType.Network, '网络错误'],
    ['连接网络失败', ErrorType.Network, '网络错误'],
    [{ message: 'ETIMEDOUT' }, ErrorType.Network, '网络错误'],
  ])('classifies network failures (%s)', (error, type, title) => {
    expect(classifyError(error)).toMatchObject({ type, title, originalError: error });
  });

  it.each([
    [{ message: '未认证', status: 200 }, ErrorType.Auth],
    [{ message: 'plain', statusCode: 401 }, ErrorType.Auth],
    [{ message: 'token expired' }, ErrorType.Auth],
    [{ message: 'plain', response: { status: 401 } }, ErrorType.Auth],
  ])('classifies auth failures via message or status (%j)', (error, type) => {
    expect(classifyError(error)).toMatchObject({ type, title: '认证失败' });
  });

  it.each([
    [{ message: 'oops', statusCode: 500 }, ErrorType.Server],
    [{ message: 'oops', response: { status: 503 } }, ErrorType.Server],
    [new Error('Internal Server Error'), ErrorType.Server],
    [{ message: '服务器无响应', status: 0 }, ErrorType.Server],
  ])('classifies server errors via status range or keywords (%j)', (error, type) => {
    expect(classifyError(error)).toMatchObject({ type, title: '服务器错误' });
  });

  it('falls back to an unknown classification', () => {
    expect(classifyError(new Error('mystery'))).toMatchObject({
      type: ErrorType.Unknown, title: '操作失败', message: '操作失败，请稍后重试',
    });
  });

  it('extracts messages from strings, objects and primitives', () => {
    expect(classifyError('网络错误').message).toBe('网络连接失败，请检查网络设置');
    // msg/detail fallbacks feed classification.
    expect(classifyError({ msg: 'unauthorized' }).type).toBe(ErrorType.Auth);
    expect(classifyError({ detail: '502' }).type).toBe(ErrorType.Server);
    expect(classifyError(42).type).toBe(ErrorType.Unknown);
  });
});

describe('showError and showErrorMessage', () => {
  it('classifies the error and copies details on confirm', () => {
    showError(new Error('token 无效'));
    expect(mockXConfirm).toHaveBeenCalledWith(
      '认证失败', '登录已过期，请重新登录', expect.any(Function), undefined,
      { confirmText: '复制', cancelText: '关闭' },
    );
    mockXConfirm.mock.calls[0]![2]();
    expect(mockSetStringAsync).toHaveBeenCalledWith('认证失败: 登录已过期，请重新登录');
    expect(warnSpy).toHaveBeenCalledWith('[ErrorHandler] AUTH: 登录已过期，请重新登录', expect.any(Error));
  });

  it('shows a custom title and message', () => {
    showErrorMessage('自定义', '内容');
    expect(mockXConfirm).toHaveBeenCalledWith(
      '自定义', '内容', expect.any(Function), undefined,
      { confirmText: '复制', cancelText: '关闭' },
    );
    mockXConfirm.mock.calls[0]![2]();
    expect(mockSetStringAsync).toHaveBeenCalledWith('自定义: 内容');
  });

  it('warns instead of throwing when the dialog layer fails', () => {
    mockXConfirm.mockImplementation(() => { throw new Error('UI 崩溃'); });
    expect(() => showError(new Error('x'))).not.toThrow();
    expect(() => showErrorMessage('t', 'm')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('[ErrorHandler] 错误处理失败:', expect.any(Error));
  });
});

describe('logError', () => {
  it('logs the extracted message with an optional context', () => {
    logError(new Error('磁盘写入失败'));
    expect(warnSpy).toHaveBeenCalledWith('[ErrorHandler] 磁盘写入失败', expect.any(Error));

    logError({ msg: '降级警告' }, 'sync');
    expect(warnSpy).toHaveBeenCalledWith('[ErrorHandler] [sync] 降级警告', { msg: '降级警告' });

    logError(null);
    expect(warnSpy).toHaveBeenCalledWith('[ErrorHandler] null', null);

    logError({ odd: true });
    expect(warnSpy).toHaveBeenCalledWith('[ErrorHandler] {"odd":true}', { odd: true });
  });

  it('swallows logging failures', () => {
    warnSpy.mockImplementation(() => { throw new Error('console 不可用'); });
    expect(() => logError(new Error('x'))).not.toThrow();
  });
});
