const mockConfig: any = {};
const mockDatasource: any = {};
const mockBridge: any = {};

jest.mock('../../../src/store', () => {
  const state = { bbtalk: { bbtalks: [] as unknown[] } };
  return {
    __esModule: true,
    store: { getState: () => state },
    __state: state,
  };
});
jest.mock('../../../src/services/widget/config', () => ({
  __esModule: true,
  loadWidgetConfig: (...args: any[]) => mockConfig.loadWidgetConfig(...args),
  saveWidgetConfig: (...args: any[]) => mockConfig.saveWidgetConfig(...args),
  computeConfigHash: (...args: any[]) => mockConfig.computeConfigHash(...args),
}));
jest.mock('../../../src/services/widget/datasource', () => ({
  __esModule: true,
  selectWidgetItems: (...args: any[]) => mockDatasource.selectWidgetItems(...args),
  toWidgetItem: (...args: any[]) => mockDatasource.toWidgetItem(...args),
}));
jest.mock('../../../src/services/widget/bridge', () => ({
  __esModule: true,
  isSupported: (...args: any[]) => mockBridge.isSupported(...args),
  writeWidgetData: (...args: any[]) => mockBridge.writeWidgetData(...args),
  reloadWidget: (...args: any[]) => mockBridge.reloadWidget(...args),
  readWidgetData: (...args: any[]) => mockBridge.readWidgetData(...args),
}));

import {
  syncWidget,
  clearWidget,
  _resetReloadState,
} from '../../../src/services/widget';
import { DEFAULT_THEME, MAX_PAYLOAD_BYTES } from '../../../src/services/widget/types';
import type { WidgetConfig, WidgetItem } from '../../../src/services/widget/types';

const Store: any = require('../../../src/store');

const baseConfig: WidgetConfig = {
  strategy: 'recent', recentCount: 5, tagIds: [], manualUids: [], includePrivate: false,
};

const item = (uid: string, content: string, thumbnailUrl: string | null = null): WidgetItem => ({
  uid, content, updatedAt: '2026-01-01T00:00:00.000Z',
  isPinned: false, visibility: 'public', tags: [], thumbnailUrl,
});

const writtenPayloads = () =>
  mockBridge.writeWidgetData.mock.calls.map((call: any[]) => JSON.parse(call[0] as string));
const lastWritten = () => writtenPayloads()[writtenPayloads().length - 1];

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  Store.__state.bbtalk.bbtalks = [];
  _resetReloadState();
  mockConfig.loadWidgetConfig = jest.fn(async () => ({ ...baseConfig }));
  mockConfig.computeConfigHash = jest.fn(() => 'abc123');
  mockDatasource.selectWidgetItems = jest.fn(() => [] as WidgetItem[]);
  mockBridge.isSupported = jest.fn(() => true);
  mockBridge.writeWidgetData = jest.fn(async () => undefined);
  mockBridge.reloadWidget = jest.fn(async () => undefined);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => { warnSpy.mockRestore(); });

describe('syncWidget', () => {
  it('writes a payload built from the store and reloads the widget', async () => {
    Store.__state.bbtalk.bbtalks = [{ id: 'b1' }];
    mockDatasource.selectWidgetItems = jest.fn(() => [item('a', 'hello', 'https://img.example/a.png')]);

    await syncWidget();

    expect(mockDatasource.selectWidgetItems).toHaveBeenCalledWith({ ...baseConfig }, [{ id: 'b1' }]);
    expect(mockBridge.writeWidgetData).toHaveBeenCalledTimes(1);
    const payload = lastWritten();
    expect(payload).toMatchObject({
      version: 1,
      configHash: 'abc123',
      locked: false,
      authenticated: true,
      theme: DEFAULT_THEME,
      placeholder: null,
      items: [{ uid: 'a', content: 'hello', thumbnailUrl: 'https://img.example/a.png' }],
    });
    expect(new Date(payload.generatedAt).toString()).not.toBe('Invalid Date');
    expect(mockBridge.reloadWidget).toHaveBeenCalledTimes(1);
  });

  it('passes through authenticated and locked options', async () => {
    await syncWidget({ authenticated: false, locked: true });
    expect(lastWritten()).toMatchObject({ authenticated: false, locked: true });
  });

  it('is a no-op on unsupported platforms', async () => {
    mockBridge.isSupported = jest.fn(() => false);
    await syncWidget();
    await clearWidget('logout');
    expect(mockConfig.loadWidgetConfig).not.toHaveBeenCalled();
    expect(mockBridge.writeWidgetData).not.toHaveBeenCalled();
  });

  it('warns and swallows config-load or build failures', async () => {
    mockConfig.loadWidgetConfig = jest.fn(() => Promise.reject(new Error('存储损坏')));
    await syncWidget();
    expect(mockBridge.writeWidgetData).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[HomeWidget] syncWidget failed:', expect.any(Error));

    mockConfig.loadWidgetConfig = jest.fn(async () => ({ ...baseConfig }));
    mockDatasource.selectWidgetItems = jest.fn(() => { throw new Error('选择器崩溃'); });
    await syncWidget();
    expect(warnSpy).toHaveBeenCalledWith('[HomeWidget] syncWidget failed:', expect.any(Error));
  });
});

describe('trimPayload tiers', () => {
  it('keeps thumbnails when the payload already fits', async () => {
    mockDatasource.selectWidgetItems = jest.fn(() => [item('a', 'hi', 'https://img.example/a.png')]);
    await syncWidget();
    expect(lastWritten().items[0].thumbnailUrl).toBe('https://img.example/a.png');
  });

  it('drops thumbnails first when oversized', async () => {
    mockDatasource.selectWidgetItems = jest.fn(() => [item('a', 'hello', 'T'.repeat(17000))]);
    await syncWidget();
    const payload = lastWritten();
    const raw = mockBridge.writeWidgetData.mock.calls[0]![0] as string;
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].thumbnailUrl).toBeNull();
    expect(payload.items[0].content).toBe('hello');
    expect(raw.length * 2).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
  });

  it('slices content to 80 chars when still oversized', async () => {
    mockDatasource.selectWidgetItems = jest.fn(() => [
      item('a', 'C'.repeat(6000)), item('b', 'C'.repeat(6000)),
      item('c', 'C'.repeat(6000)), item('d', 'C'.repeat(6000)),
    ]);
    await syncWidget();
    const payload = lastWritten();
    expect(payload.items).toHaveLength(4);
    payload.items.forEach((it: WidgetItem) => {
      expect(it.content).toBe('C'.repeat(80));
      expect(it.thumbnailUrl).toBeNull();
    });
  });

  it('drops trailing items until the payload fits, keeping the newest-first head', async () => {
    const many = Array.from({ length: 100 }, (_, i) => item(`u-${String(i).padStart(3, '0')}`, 'X'.repeat(100)));
    mockDatasource.selectWidgetItems = jest.fn(() => many);
    await syncWidget();
    const raw = mockBridge.writeWidgetData.mock.calls[0]![0] as string;
    const payload = JSON.parse(raw);
    expect(raw.length * 2).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    expect(payload.items.length).toBeGreaterThan(50);
    expect(payload.items.length).toBeLessThan(100);
    expect(payload.items[0].uid).toBe('u-000');
    // Survivors are a contiguous prefix of the original list.
    expect(payload.items[payload.items.length - 1].uid)
      .toBe(`u-${String(payload.items.length - 1).padStart(3, '0')}`);
  });
});

describe('writeAndReload failure handling', () => {
  it('skips the reload when writing fails', async () => {
    mockBridge.writeWidgetData = jest.fn(() => Promise.reject(new Error('磁盘满')));
    await syncWidget();
    expect(warnSpy).toHaveBeenCalledWith('[HomeWidget] writeWidgetData failed:', expect.any(Error));
    expect(mockBridge.reloadWidget).not.toHaveBeenCalled();
  });

  it('counts reload failures and resets the counter after a success', async () => {
    mockBridge.reloadWidget = jest.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('超时')))
      .mockImplementationOnce(() => Promise.reject(new Error('超时')))
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(() => Promise.reject(new Error('超时')));

    await syncWidget();
    await syncWidget();
    await syncWidget();
    await syncWidget();

    const messages = warnSpy.mock.calls.map((c: any[]) => String(c[0]));
    expect(messages).toEqual(expect.arrayContaining([
      '[HomeWidget] reloadWidget failed (1/3):',
      '[HomeWidget] reloadWidget failed (2/3):',
      // Success reset the counter, so the last failure counts as 1 again.
      '[HomeWidget] reloadWidget failed (1/3):',
    ]));
    expect(messages).not.toContain('[HomeWidget] reloadWidget failed (3/3):');
    expect(messages).not.toContain(expect.stringContaining('enter reload cooldown'));
  });

  it('enters a cooldown after three consecutive failures and skips reloads', async () => {
    mockBridge.reloadWidget = jest.fn(() => Promise.reject(new Error('挂了')));
    await syncWidget();
    await syncWidget();
    await syncWidget();
    expect(mockBridge.reloadWidget).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledWith('[HomeWidget] enter reload cooldown for 300s');

    // Fourth sync still writes but must not reload while cooling down.
    await syncWidget();
    expect(mockBridge.writeWidgetData).toHaveBeenCalledTimes(4);
    expect(mockBridge.reloadWidget).toHaveBeenCalledTimes(3);

    // Resetting the state re-enables reloads.
    _resetReloadState();
    await syncWidget();
    expect(mockBridge.reloadWidget).toHaveBeenCalledTimes(4);
  });
});

describe('clearWidget', () => {
  it.each([
    ['logout', '请登录', { authenticated: false, locked: false }],
    ['locked', '已锁定', { authenticated: true, locked: true }],
    ['empty', '暂无内容，点击记录一下 👇', { authenticated: true, locked: false }],
  ] as const)('writes the %s placeholder', async (reason, placeholder, flags) => {
    await clearWidget(reason);
    const payload = lastWritten();
    expect(payload).toMatchObject({
      ...flags,
      placeholder,
      items: [],
      configHash: 'abc123',
      theme: DEFAULT_THEME,
      version: 1,
    });
    expect(mockDatasource.selectWidgetItems).not.toHaveBeenCalled();
    expect(mockBridge.reloadWidget).toHaveBeenCalledTimes(1);
  });

  it('warns and swallows config-load failures', async () => {
    mockConfig.loadWidgetConfig = jest.fn(() => Promise.reject(new Error('读取失败')));
    await clearWidget('empty');
    expect(mockBridge.writeWidgetData).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[HomeWidget] clearWidget failed:', expect.any(Error));
  });
});
