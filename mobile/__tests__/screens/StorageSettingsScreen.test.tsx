const mockApi: any = {};
const mockXAlert = jest.fn();
const mockXConfirm = jest.fn();
const mockLoadingPlaceholder = jest.fn((_props: any) => null as any);

jest.mock('../../src/services/api/apiClient', () => ({
  apiClient: {
    get: (...args: any[]) => mockApi.get(...args),
    post: (...args: any[]) => mockApi.post(...args),
    delete: (...args: any[]) => mockApi.delete(...args),
  },
}));
jest.mock('../../src/utils/crossAlert', () => ({
  xAlert: (...args: any[]) => mockXAlert(...args),
  xConfirm: (...args: any[]) => mockXConfirm(...args),
}));
jest.mock('../../src/components/LoadingPlaceholder', () => ({ __esModule: true, get default() { return mockLoadingPlaceholder; } }));

jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', TextInput: 'TextInput',
  ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView',
  StyleSheet: { create: (value: unknown) => value }, Platform: { OS: 'ios', select: (options: any) => options.ios },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 10, bottom: 12, left: 0, right: 0 }) }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));

import React from 'react';
import StorageSettingsScreen from '../../src/screens/StorageSettingsScreen';
import type { StorageSettings } from '../../src/types';

const { create, act } = require('react-test-renderer');

let tree: any;
const settle = async (rounds = 3) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
};

const makeConfig = (id: number, name: string, isActive: boolean, overrides: Partial<StorageSettings> = {}): StorageSettings => ({
  id, name, storage_type: 's3', s3_access_key_id: 'ak', s3_bucket_name: `bucket-${id}`,
  s3_region_name: 'us-east-1', s3_endpoint_url: '', s3_custom_domain: '', is_active: isActive,
  has_secret_key: true, is_s3_configured: true, create_time: '2026-01-01T00:00:00Z', update_time: '2026-01-01T00:00:00Z',
  ...overrides,
});

const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
function tappable(label: string) {
  const matches = tree.root.findAllByType('TouchableOpacity').filter((node: any) =>
    node.props.accessibilityLabel === label || node.findAllByType('Text').some((text: any) => childText(text.props.children) === label));
  return matches.find((node: any) => !matches.some((other: any) => other !== node && node.findAllByType('TouchableOpacity').includes(other)));
}
async function press(label: string) { await act(async () => { void tappable(label)!.props.onPress(); }); }
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
const inputByLabel = (label: string) => tree.root.findAllByType('TextInput').find((node: any) => node.props.accessibilityLabel === label);
async function type(label: string, value: string) {
  await act(async () => { inputByLabel(label)!.props.onChangeText(value); });
}

const configs = () => [makeConfig(1, '阿里云OSS', true, { s3_endpoint_url: 'https://oss.example' }), makeConfig(2, 'MinIO', false)];

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadingPlaceholder.mockImplementation((_props: any) => null);
  mockApi.get = jest.fn(async () => configs());
  mockApi.post = jest.fn(async () => ({}) as any);
  mockApi.delete = jest.fn(async () => ({}) as any);
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

async function mountScreen() {
  await act(async () => { tree = create(<StorageSettingsScreen />); });
  await settle();
}

describe('StorageSettingsScreen loading and status', () => {
  it('shows a placeholder until configs resolve', async () => {
    let resolveLoad!: (value: StorageSettings[]) => void;
    mockApi.get = jest.fn(() => new Promise(resolve => { resolveLoad = resolve; }));
    await act(async () => { tree = create(<StorageSettingsScreen />); });
    await settle();
    expect(mockLoadingPlaceholder).toHaveBeenCalled();
    await act(async () => { resolveLoad([]); });
    await settle();
    expect(tappable('添加 S3 存储配置')).toBeDefined();
  });

  it('explains failures, marks the status unknown, and blocks actions until retry', async () => {
    mockApi.get = jest.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('网关超时')))
      .mockImplementationOnce(() => Promise.resolve(configs()));
    await mountScreen();
    expect(hasText('网关超时')).toBe(true);
    expect(hasText('当前: 暂时无法确认')).toBe(true);
    // No config cards render while the list is unknown.
    expect(tappable('测试配置 阿里云OSS')).toBeUndefined();
    expect(tappable('添加 S3 存储配置')!.props.disabled).toBe(true);
    await press('重新加载');
    await settle();
    expect(hasText('当前: 阿里云OSS')).toBe(true);
    expect(tappable('添加 S3 存储配置')!.props.disabled).toBe(false);
  });

  it('renders config cards with active state, fallbacks and optional endpoint', async () => {
    await mountScreen();
    expect(hasText('已激活')).toBe(true);
    expect(hasText('桶: bucket-1')).toBe(true);
    expect(hasText('区域: us-east-1')).toBe(true);
    expect(hasText('端点: https://oss.example')).toBe(true);
    expect(tappable('激活配置 MinIO')).toBeDefined();
    expect(tappable('激活配置 阿里云OSS')).toBeUndefined();
    // MinIO has no endpoint configured.
    expect(tree.root.findAllByType('Text').filter((t: any) => childText(t.props.children) === '端点: ')).toHaveLength(0);
  });

  it('shows the local-storage card as selected when nothing is active', async () => {
    mockApi.get = jest.fn(async () => [makeConfig(2, 'MinIO', false)]);
    await mountScreen();
    expect(hasText('当前: 服务器本地存储')).toBe(true);
    expect(tappable('使用服务器本地存储')!.props.disabled).toBe(true);
    mockApi.get = jest.fn(async () => [makeConfig(1, 'OSS', true)]);
    await mountScreen();
    expect(tappable('使用服务器本地存储')!.props.disabled).toBe(false);
  });
});

describe('StorageSettingsScreen actions', () => {
  it('activates a config and explains the effect', async () => {
    await mountScreen();
    await press('激活配置 MinIO');
    await settle();
    expect(mockApi.post).toHaveBeenCalledWith('/api/v1/bbtalk/settings/storage/2/activate/');
    expect(mockXAlert).toHaveBeenCalledWith('成功', '新上传的附件将使用此配置，已有附件保持原存储位置');
    expect(mockApi.get).toHaveBeenCalledTimes(2);
  });

  it('deactivates every config back to server storage', async () => {
    await mountScreen();
    await press('使用服务器本地存储');
    await settle();
    expect(mockApi.post).toHaveBeenCalledWith('/api/v1/bbtalk/settings/storage/deactivate-all/');
    expect(mockXAlert).toHaveBeenCalledWith('成功', '新上传的附件将使用服务器存储，已有附件保持原存储位置');
  });

  it('reports activation failures', async () => {
    mockApi.post = jest.fn().mockImplementationOnce(() => Promise.reject(new Error('无权限')));
    await mountScreen();
    await press('激活配置 MinIO');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('失败', '无权限');
  });

  it('surfaces test connection outcomes', async () => {
    mockApi.post = jest.fn()
      .mockImplementationOnce(async () => ({ success: true, message: '可访问' }) as any)
      .mockImplementationOnce(async () => ({ success: false, message: '凭证无效' }) as any)
      .mockImplementationOnce(() => Promise.reject(new Error('超时')));
    await mountScreen();
    await press('测试配置 阿里云OSS');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('连接成功', '可访问');
    await press('测试配置 阿里云OSS');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('连接失败', '凭证无效');
    await press('测试配置 阿里云OSS');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('测试失败', '超时');
  });

  it('deletes a config after confirmation', async () => {
    mockApi.get = jest.fn()
      .mockImplementationOnce(async () => [makeConfig(2, 'MinIO', false)])
      .mockImplementationOnce(async () => []);
    await mountScreen();
    await press('删除配置 MinIO');
    expect(mockXConfirm).toHaveBeenCalledWith('确认删除', '确定删除此存储配置？', expect.any(Function), undefined, {
      confirmText: '删除', destructive: true,
    });
    expect(mockApi.delete).not.toHaveBeenCalled();
    await act(async () => { await mockXConfirm.mock.calls[0]![2](); });
    await settle();
    expect(mockApi.delete).toHaveBeenCalledWith('/api/v1/bbtalk/settings/storage/2/delete/');
    expect(tappable('删除配置 MinIO')).toBeUndefined();
  });
});

describe('StorageSettingsScreen creation', () => {
  it('validates required fields before submitting', async () => {
    await mountScreen();
    await press('添加 S3 存储配置');
    await type('配置名称', '新OSS');
    await press('创建');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('请补全配置', '配置名称、存储桶、Access Key ID 和 Secret Access Key 都不能为空');
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('creates an s3 config, resets the form and hides it', async () => {
    await mountScreen();
    await press('添加 S3 存储配置');
    await type('配置名称', '新OSS');
    await type('Access Key ID', 'ak-new');
    await type('Secret Access Key', 'sk-new');
    await type('存储桶名称', 'bucket-new');
    await type('端点 URL（可选）', 'https://minio.local');
    await press('创建');
    await settle();
    expect(mockApi.post).toHaveBeenCalledWith('/api/v1/bbtalk/settings/storage/create/', {
      name: '新OSS', s3_access_key_id: 'ak-new', s3_secret_access_key: 'sk-new',
      s3_bucket_name: 'bucket-new', s3_region_name: 'us-east-1', s3_endpoint_url: 'https://minio.local',
      storage_type: 's3',
    });
    expect(mockXAlert).toHaveBeenCalledWith('成功', '配置已创建，测试连接成功后可激活使用');
    expect(tappable('添加 S3 存储配置')).toBeDefined();
    expect(inputByLabel('配置名称')).toBeUndefined();
  });

  it('cancels the form without posting and reports create failures', async () => {
    await mountScreen();
    await press('添加 S3 存储配置');
    await type('配置名称', 'x');
    await press('取消');
    expect(tappable('添加 S3 存储配置')).toBeDefined();
    expect(mockApi.post).not.toHaveBeenCalled();

    await press('添加 S3 存储配置');
    await type('配置名称', 'x');
    await type('Access Key ID', 'a');
    await type('Secret Access Key', 'b');
    await type('存储桶名称', 'c');
    mockApi.post = jest.fn().mockImplementationOnce(() => Promise.reject(new Error('桶不存在')));
    await press('创建');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('失败', '桶不存在');
    expect(inputByLabel('配置名称')).toBeDefined();
  });

  it('shows progress and locks actions while a request is running', async () => {
    let resolveActivate!: (value: any) => void;
    mockApi.post = jest.fn(() => new Promise(resolve => { resolveActivate = resolve; }));
    await mountScreen();
    await press('激活配置 MinIO');
    await settle();
    expect(hasText('正在处理，请稍候…')).toBe(true);
    expect(tappable('测试配置 阿里云OSS')!.props.disabled).toBe(true);
    await act(async () => { resolveActivate({}); });
    await settle();
    expect(hasText('正在处理，请稍候…')).toBe(false);
  });
});
