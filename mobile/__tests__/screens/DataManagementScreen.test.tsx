// File-system, sharing and picker mocks keep their mutable state inside the
// factories (module-load order) and expose it via __-prefixed members.
jest.mock('expo-file-system/next', () => {
  const instances: any[] = [];
  class Directory {
    base: any;
    name: string;
    exists = false;
    constructor(base: any, name: string) { this.base = base; this.name = name; }
    create() { this.exists = true; }
  }
  class File {
    dir: any;
    name: string;
    uri: string;
    write = jest.fn();
    constructor(dir: any, name: string) { this.dir = dir; this.name = name; this.uri = `file:///doc/bbtalk_exports/${name}`; instances.push(this); }
  }
  return { Paths: { document: '/doc' }, Directory, File, __instances: instances };
});

jest.mock('expo-file-system/legacy', () => ({ writeAsStringAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })) }));

const mockGetAccessToken = jest.fn((..._args: any[]) => Promise.resolve('tok123'));
const mockClearCache = jest.fn((..._args: any[]) => Promise.resolve());
const mockXAlert = jest.fn();
const mockXConfirm = jest.fn();

jest.mock('../../src/services/auth', () => ({ getAccessToken: (...args: any[]) => mockGetAccessToken(...args) }));
jest.mock('../../src/config', () => ({ getApiBaseUrl: () => 'https://api.test' }));
jest.mock('../../src/services/offlineCacheService', () => ({ clearCache: (...args: any[]) => mockClearCache(...args) }));
jest.mock('../../src/utils/crossAlert', () => ({
  xAlert: (...args: any[]) => mockXAlert(...args),
  xConfirm: (...args: any[]) => mockXConfirm(...args),
}));

jest.mock('react-native', () => {
  const platform = { OS: 'ios' };
  return {
    View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity',
    ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (value: unknown) => value },
    Platform: platform, __platform: platform,
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 10, bottom: 12, left: 0, right: 0 }) }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));

import React from 'react';
import DataManagementScreen from '../../src/screens/DataManagementScreen';

const { create, act } = require('react-test-renderer');

const FSNext: any = require('expo-file-system/next');
const LegacyFS: any = require('expo-file-system/legacy');
const Sharing: any = require('expo-sharing');
const DocumentPicker: any = require('expo-document-picker');
const RN: any = require('react-native');

const mockFetch = jest.fn((..._args: any[]) => Promise.resolve({} as any));

class MockFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: any = null;
  readAsText(blob: any) { this.result = blob.__text ?? ''; this.onload?.(); }
  readAsDataURL(blob: any) { this.result = 'data:application/octet-stream;base64,' + (blob.__base64 ?? ''); this.onload?.(); }
}

let tree: any;
const settle = async (rounds = 3) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
};
async function mountScreen() {
  await act(async () => { tree = create(<DataManagementScreen />); });
  await settle();
}
const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
function tappable(label: string) {
  const matches = tree.root.findAllByType('TouchableOpacity').filter((node: any) =>
    node.findAllByType('Text').some((text: any) => childText(text.props.children) === label));
  return matches.find((node: any) => !matches.some((other: any) => other !== node && node.findAllByType('TouchableOpacity').includes(other)));
}
// Handlers are async (network-bound); fire them without awaiting the returned
// promise so deferred responses keep the component in its busy state.
async function press(label: string) { await act(async () => { void tappable(label)!.props.onPress(); }); }

const exportResponse = (blob: any) => ({ ok: true, blob: async () => blob });

beforeEach(() => {
  jest.clearAllMocks();
  FSNext.__instances.length = 0;
  RN.__platform.OS = 'ios';
  mockGetAccessToken.mockImplementation(() => Promise.resolve('tok123'));
  mockClearCache.mockImplementation(() => Promise.resolve());
  mockFetch.mockReset();
  (global as any).fetch = mockFetch;
  (global as any).FileReader = MockFileReader;
  (global as any).URL = Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:export'), revokeObjectURL: jest.fn() });
  (global as any).document = { createElement: () => ({ click: jest.fn() }) };
  (global as any).File = class MockFile { parts: any[]; name: string; type: string; constructor(parts: any[], name: string, opts: any) { this.parts = parts; this.name = name; this.type = opts?.type ?? ''; } };
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('DataManagementScreen export', () => {
  it('exports json natively, writes text and opens the share sheet', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve(exportResponse({ __text: '{"records":[]}' })));
    Sharing.isAvailableAsync.mockImplementationOnce(() => Promise.resolve(true));
    await mountScreen();
    await press('导出 JSON（不含附件文件）');
    await settle();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test/api/v1/bbtalk/data/export?format=json',
      { headers: { Authorization: 'Bearer tok123' } },
    );
    const file = FSNext.__instances.find((f: any) => f.name.endsWith('.json'));
    expect(file.name).toMatch(/^bbtalk_export_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
    expect(file.write).toHaveBeenCalledWith('{"records":[]}');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(file.uri, { mimeType: 'application/json', dialogTitle: '导出数据' });
    expect(mockXAlert).toHaveBeenCalledWith('导出文件已生成', '文件已生成，请在分享面板中保存或发送');
  });

  it('exports zip as base64 and reports the saved path when sharing is unavailable', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve(exportResponse({ __base64: 'QUJD' })));
    Sharing.isAvailableAsync.mockImplementationOnce(() => Promise.resolve(false));
    await mountScreen();
    await press('导出 ZIP（含附件）');
    await settle();
    const file = FSNext.__instances.find((f: any) => f.name.endsWith('.zip'));
    expect(LegacyFS.writeAsStringAsync).toHaveBeenCalledWith(file.uri, 'QUJD', { encoding: 'base64' });
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(mockXAlert).toHaveBeenCalledWith('导出文件已生成', `文件已保存至：${file.uri}`);
  });

  it('triggers a browser download on web', async () => {
    RN.__platform.OS = 'web';
    const click = jest.fn();
    (global as any).document = { createElement: () => ({ click }) };
    mockFetch.mockImplementationOnce(() => Promise.resolve(exportResponse({ __text: '[]' })));
    await mountScreen();
    await press('导出 JSON（不含附件文件）');
    await settle();
    expect(click).toHaveBeenCalled();
    expect(mockXAlert).toHaveBeenCalledWith('导出文件已生成', '已开始下载，请在浏览器下载列表查看文件');
  });

  it('explains server and network export failures', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500 }));
    await mountScreen();
    await press('导出 JSON（不含附件文件）');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('导出失败', '服务器返回 500');
    mockFetch.mockImplementationOnce(() => Promise.reject(new Error('网络中断')));
    await press('导出 JSON（不含附件文件）');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('导出失败', '网络中断');
  });

  it('disables sibling actions and shows progress while an export is running', async () => {
    let resolveFetch!: (value: any) => void;
    mockFetch.mockImplementationOnce(() => new Promise(resolve => { resolveFetch = resolve; }));
    await mountScreen();
    await press('导出 JSON（不含附件文件）');
    await settle();
    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(1);
    expect(tappable('导出 ZIP（含附件）')!.props.disabled).toBe(true);
    resolveFetch(exportResponse({ __text: '[]' }));
    await settle();
    expect(tappable('导出 ZIP（含附件）')!.props.disabled).toBe(false);
  });
});

describe('DataManagementScreen import', () => {
  const pickResult = (name: string, uri = `file:///pick/${name}`, mimeType: string | null = null) => ({
    canceled: false, assets: [{ uri, name, mimeType }],
  });
  const importResponse = (json: any) => ({ ok: true, json: async () => json });

  it('uploads a picked json natively and summarizes the result', async () => {
    DocumentPicker.getDocumentAsync.mockImplementationOnce(() => Promise.resolve(pickResult('backup.json')));
    mockFetch.mockImplementationOnce(() => Promise.resolve(importResponse({
      success: true,
      stats: { tags_created: 2, tags_skipped: 1, bbtalks_created: 5, bbtalks_skipped: 2, errors: [] },
    })));
    await mountScreen();
    await press('选择文件导入');
    await settle();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.test/api/v1/bbtalk/data/import');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ Authorization: 'Bearer tok123' });
    expect(options.body).toBeInstanceOf(FormData);
    expect(mockXAlert).toHaveBeenCalledWith('导入完成', '标签: 新增 2，跳过 1，共 3\nBBTalk: 新增 5，跳过 2，共 7');
  });

  it('mentions per-row errors when the import reports any', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    DocumentPicker.getDocumentAsync.mockImplementationOnce(() => Promise.resolve(pickResult('backup.zip', 'file:///pick/backup.zip', 'application/zip')));
    mockFetch.mockImplementationOnce(() => Promise.resolve(importResponse({
      success: true,
      stats: { tags_created: 0, tags_skipped: 0, bbtalks_created: 0, bbtalks_skipped: 0, errors: ['bad row'] },
    })));
    await mountScreen();
    await press('选择文件导入');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('导入完成', expect.stringContaining('错误: 1 条'));
    expect(appendSpy).toHaveBeenCalledWith('file', {
      uri: 'file:///pick/backup.zip', name: 'backup.zip', type: 'application/zip',
    });
    appendSpy.mockRestore();
  });

  it('imports through a fetched blob on web', async () => {
    RN.__platform.OS = 'web';
    DocumentPicker.getDocumentAsync.mockImplementationOnce(() => Promise.resolve(pickResult('backup.json', 'blob:pick')));
    mockFetch.mockImplementationOnce(() => Promise.resolve({ blob: async () => ({ __text: '[]' }) }));
    mockFetch.mockImplementationOnce(() => Promise.resolve(importResponse({ success: true, stats: { tags_created: 1, tags_skipped: 0, bbtalks_created: 1, bbtalks_skipped: 0, errors: [] } })));
    await mountScreen();
    await press('选择文件导入');
    await settle();
    expect(mockFetch).toHaveBeenNthCalledWith(1, 'blob:pick');
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'https://api.test/api/v1/bbtalk/data/import', expect.objectContaining({ method: 'POST' }));
    expect(mockXAlert).toHaveBeenCalledWith('导入完成', expect.stringContaining('标签: 新增 1'));
  });

  it('rejects unsupported file names and skips canceled picks', async () => {
    DocumentPicker.getDocumentAsync.mockImplementationOnce(() => Promise.resolve(pickResult('photo.png')));
    await mountScreen();
    await press('选择文件导入');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('文件格式不支持', '请选择本应用导出的 JSON 或 ZIP 文件');
    expect(mockFetch).not.toHaveBeenCalled();
    DocumentPicker.getDocumentAsync.mockImplementationOnce(() => Promise.resolve({ canceled: true }));
    await press('选择文件导入');
    await settle();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('surfaces server, payload and network import failures', async () => {
    DocumentPicker.getDocumentAsync.mockImplementation(() => Promise.resolve(pickResult('backup.json')));
    mockFetch.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 400 }));
    await mountScreen();
    await press('选择文件导入');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('导入失败', '导入失败，服务器返回 400');
    mockFetch.mockImplementationOnce(() => Promise.resolve(importResponse({ success: false, error: '格式错误' })));
    await press('选择文件导入');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('导入失败', '格式错误');
    mockFetch.mockImplementationOnce(() => Promise.reject(new Error('连接重置')));
    await press('选择文件导入');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('导入失败', '连接重置');
  });
});

describe('DataManagementScreen cache clearing', () => {
  it('clears the offline cache after confirming', async () => {
    await mountScreen();
    await press('清除离线缓存');
    expect(mockXConfirm).toHaveBeenCalledWith('清除离线缓存', '确定要清除所有离线缓存数据吗？', expect.any(Function), undefined, {
      confirmText: '确定', destructive: true,
    });
    await act(async () => { await mockXConfirm.mock.calls[0]![2](); });
    await settle();
    expect(mockClearCache).toHaveBeenCalled();
    expect(mockXAlert).toHaveBeenCalledWith('清除成功', '离线缓存已清除');
  });

  it('reports a failed cache clear', async () => {
    mockClearCache.mockImplementationOnce(() => Promise.reject(new Error('文件被占用')));
    await mountScreen();
    await press('清除离线缓存');
    await act(async () => { await mockXConfirm.mock.calls[0]![2](); });
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('清除失败', '文件被占用');
  });
});
