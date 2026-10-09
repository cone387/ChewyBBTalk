import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import S3ConfigListPage from '../src/pages/S3ConfigListPage';
import type { StorageSettings } from '../src/types';

const api = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), update: vi.fn(), activate: vi.fn(), remove: vi.fn(), test: vi.fn(),
}));
const boundary = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../src/services/api/settingsApi', () => ({
  settingsApi: {
    listStorageSettings: api.list,
    createStorageSettings: api.create,
    updateStorageSettings: api.update,
    activateStorageSettings: api.activate,
    deleteStorageSettings: api.remove,
    testStorageConnectionById: api.test,
  },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => boundary.navigate }));

function config(overrides: Partial<StorageSettings> = {}): StorageSettings {
  return {
    id: 1, name: '阿里云', storage_type: 's3',
    s3_access_key_id: 'AKID', s3_bucket_name: 'bucket-a', s3_region_name: 'cn-hangzhou',
    s3_endpoint_url: 'https://oss.example.com', s3_custom_domain: '',
    is_active: true, has_secret_key: true, is_s3_configured: true,
    create_time: '', update_time: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  api.list.mockResolvedValue([]);
});
afterEach(() => cleanup());

describe('list rendering', () => {
  it('shows the loading state first, then the empty state with a starter button', async () => {
    api.list.mockReturnValue(new Promise(() => {}));
    render(<S3ConfigListPage />);
    expect(screen.getByText('加载中...')).toBeTruthy();
    api.list.mockResolvedValue([]);
    // A fresh render resolves into the empty state.
    cleanup();
    render(<S3ConfigListPage />);
    expect(await screen.findByText('还没有 S3 配置')).toBeTruthy();
    expect(screen.getByRole('button', { name: '创建第一个配置' })).toBeTruthy();
  });

  it('reports a failed load and dismisses the toast manually', async () => {
    api.list.mockRejectedValue(new Error('network down'));
    render(<S3ConfigListPage />);
    const toast = await screen.findByText('加载配置列表失败');
    fireEvent.click(within(toast.closest('div')!).getByRole('button'));
    await waitFor(() => expect(screen.queryByText('加载配置列表失败')).toBeNull());
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('renders cards with status badges and only offers activation to inactive configs', async () => {
    api.list.mockResolvedValue([
      config(),
      config({ id: 2, name: 'MinIO', is_active: false, is_s3_configured: false, s3_bucket_name: 'bucket-b', s3_endpoint_url: '' }),
    ]);
    render(<S3ConfigListPage />);
    expect(await screen.findByText('阿里云')).toBeTruthy();
    expect(screen.getByText('当前使用')).toBeTruthy();
    expect(screen.getByText('未完成')).toBeTruthy();
    expect(screen.getByText('bucket-a')).toBeTruthy();
    expect(screen.getByText('https://oss.example.com', { exact: false })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '激活', exact: true })).toBeTruthy();
    // The unconfigured card exposes no connection test.
    expect(screen.queryAllByRole('button', { name: '测试', exact: true })).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('返回存储设置'));
    expect(boundary.navigate).toHaveBeenCalledWith('/settings/storage');
  });
});

describe('creating a configuration', () => {
  it('supports Escape dismissal and retains the dialog while a save is pending', async () => {
    api.create.mockReturnValue(new Promise(() => {}));
    render(<S3ConfigListPage />);
    await screen.findByText('还没有 S3 配置');
    const trigger = screen.getByRole('button', { name: '新建配置' });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByPlaceholderText('例如：阿里云 OSS、MinIO 测试'), { target: { value: 'MinIO' } });
    fireEvent.change(screen.getByPlaceholderText('输入 Access Key ID'), { target: { value: 'AK' } });
    fireEvent.change(screen.getByPlaceholderText('输入 Secret Access Key'), { target: { value: 'SECRET' } });
    fireEvent.change(screen.getByPlaceholderText('输入 Bucket 名称'), { target: { value: 'bucket' } });
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: '创建 S3 配置' })).toBeTruthy();
  });
  it('opens the form pre-activating the very first configuration', async () => {
    render(<S3ConfigListPage />);
    await screen.findByText('还没有 S3 配置');
    fireEvent.click(screen.getByRole('button', { name: '新建配置' }));
    expect(screen.getByText('创建 S3 配置')).toBeTruthy();
    expect((screen.getByLabelText('激活此配置') as HTMLInputElement).checked).toBe(true);
  });

  it('validates required fields before contacting the API', async () => {
    render(<S3ConfigListPage />);
    await screen.findByText('还没有 S3 配置');
    fireEvent.click(screen.getByRole('button', { name: '新建配置' }));
    const save = screen.getByRole('button', { name: '保存', exact: true });
    fireEvent.click(save);
    expect(await screen.findByText('请输入配置名称')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('例如：阿里云 OSS、MinIO 测试'), { target: { value: 'MinIO' } });
    fireEvent.click(save);
    expect(await screen.findByText('请填写完整的 S3 配置信息')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('输入 Access Key ID'), { target: { value: 'AK' } });
    fireEvent.click(save);
    expect(await screen.findByText('请填写完整的 S3 配置信息')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('输入 Bucket 名称'), { target: { value: 'bucket' } });
    fireEvent.click(save);
    expect(await screen.findByText('创建配置时必须提供 Secret Access Key')).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('saves a complete form, closes the modal and reloads the list', async () => {
    api.create.mockResolvedValue(config({ id: 9 }));
    api.list.mockResolvedValue([]);
    render(<S3ConfigListPage />);
    await screen.findByText('还没有 S3 配置');
    fireEvent.click(screen.getByRole('button', { name: '新建配置' }));
    fireEvent.change(screen.getByPlaceholderText('例如：阿里云 OSS、MinIO 测试'), { target: { value: 'MinIO' } });
    fireEvent.change(screen.getByPlaceholderText('输入 Access Key ID'), { target: { value: 'AK' } });
    fireEvent.change(screen.getByPlaceholderText('输入 Secret Access Key'), { target: { value: 'SECRET' } });
    fireEvent.change(screen.getByPlaceholderText('输入 Bucket 名称'), { target: { value: 'bucket' } });
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByText('配置创建成功')).toBeTruthy();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'MinIO', s3_access_key_id: 'AK', s3_secret_access_key: 'SECRET',
      s3_bucket_name: 'bucket', storage_type: 's3', is_active: true,
    }));
    expect(screen.queryByText('创建 S3 配置')).toBeNull();
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it('surfaces a creation failure and keeps the form open', async () => {
    api.create.mockRejectedValue(new Error('名称已存在'));
    render(<S3ConfigListPage />);
    await screen.findByText('还没有 S3 配置');
    fireEvent.click(screen.getByRole('button', { name: '新建配置' }));
    fireEvent.change(screen.getByPlaceholderText('例如：阿里云 OSS、MinIO 测试'), { target: { value: 'MinIO' } });
    fireEvent.change(screen.getByPlaceholderText('输入 Access Key ID'), { target: { value: 'AK' } });
    fireEvent.change(screen.getByPlaceholderText('输入 Secret Access Key'), { target: { value: 'SECRET' } });
    fireEvent.change(screen.getByPlaceholderText('输入 Bucket 名称'), { target: { value: 'bucket' } });
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByText('名称已存在')).toBeTruthy();
    expect(screen.getByText('创建 S3 配置')).toBeTruthy();
    expect(api.list).toHaveBeenCalledTimes(1);
  });
});

describe('editing an existing configuration', () => {
  async function opened() {
    api.list.mockResolvedValue([config()]);
    render(<S3ConfigListPage />);
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    expect(await screen.findByText('编辑 S3 配置')).toBeTruthy();
  }
  it('prefills the form, hides the stored secret and omits it from the update', async () => {
    api.update.mockResolvedValue(config());
    await opened();
    expect((screen.getByPlaceholderText('例如：阿里云 OSS、MinIO 测试') as HTMLInputElement).value).toBe('阿里云');
    expect((screen.getByPlaceholderText('留空则不修改') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('已配置密钥，留空则不修改')).toBeTruthy();
    expect((screen.getByLabelText('激活此配置') as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('输入 Bucket 名称'), { target: { value: 'bucket-b' } });
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByText('配置更新成功')).toBeTruthy();
    expect(api.update).toHaveBeenCalledTimes(1);
    const [id, payload] = api.update.mock.calls[0];
    expect(id).toBe(1);
    expect(payload.s3_bucket_name).toBe('bucket-b');
    expect('s3_secret_access_key' in payload).toBe(false);
    expect(screen.queryByText('编辑 S3 配置')).toBeNull();
  });

  it('sends a refreshed secret and reports update failures', async () => {
    await opened();
    fireEvent.change(screen.getByPlaceholderText('留空则不修改'), { target: { value: 'NEW' } });
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(1, expect.objectContaining({ s3_secret_access_key: 'NEW' })));
    // Reopen the editor to verify a failing update keeps the form on screen.
    await waitFor(() => expect(screen.queryByText('编辑 S3 配置')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(await screen.findByText('编辑 S3 配置')).toBeTruthy();
    api.update.mockRejectedValue(new Error('更新被拒'));
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByText('更新被拒')).toBeTruthy();
    expect(screen.getByText('编辑 S3 配置')).toBeTruthy();
  });

  it('abandons changes through the cancel button', async () => {
    await opened();
    fireEvent.change(screen.getByPlaceholderText('例如：阿里云 OSS、MinIO 测试'), { target: { value: '改名' } });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByText('编辑 S3 配置')).toBeNull();
    expect(api.update).not.toHaveBeenCalled();
  });
});

describe('card actions', () => {
  it('activates a configuration and reloads, or explains the rejection', async () => {
    api.list.mockResolvedValue([config({ id: 2, name: '备用', is_active: false })]);
    api.activate.mockResolvedValue(undefined);
    render(<S3ConfigListPage />);
    fireEvent.click(await screen.findByRole('button', { name: '激活', exact: true }));
    expect(await screen.findByText('已激活配置: 备用')).toBeTruthy();
    expect(api.activate).toHaveBeenCalledWith(2);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));

    api.activate.mockRejectedValue(new Error('激活被拒'));
    fireEvent.click(screen.getByRole('button', { name: '激活', exact: true }));
    expect(await screen.findByText('激活被拒')).toBeTruthy();
  });

  it('requires confirmation before deleting and reports failures', async () => {
    api.list.mockResolvedValue([config()]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<S3ConfigListPage />);
    fireEvent.click(await screen.findByRole('button', { name: '删除' }));
    expect(api.remove).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    api.remove.mockRejectedValue(new Error('删除被拒'));
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(1));
    expect(await screen.findByText('删除被拒')).toBeTruthy();
    api.remove.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(await screen.findByText('配置已删除')).toBeTruthy();
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it('runs the connection test with a pending state and both outcomes', async () => {
    api.list.mockResolvedValue([config()]);
    let finish!: (value: { success: boolean; message: string }) => void;
    api.test.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<S3ConfigListPage />);
    fireEvent.click(await screen.findByRole('button', { name: '测试', exact: true }));
    const busy = screen.getByRole('button', { name: '测试中...' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => finish({ success: true, message: '连接正常' }));
    expect(await screen.findByText('连接正常')).toBeTruthy();
    api.test.mockResolvedValueOnce({ success: false, message: '凭据无效' });
    fireEvent.click(screen.getByRole('button', { name: '测试', exact: true }));
    expect(await screen.findByText('凭据无效')).toBeTruthy();
    api.test.mockRejectedValueOnce(new Error('超时'));
    fireEvent.click(screen.getByRole('button', { name: '测试', exact: true }));
    expect(await screen.findByText('超时')).toBeTruthy();
    api.test.mockRejectedValueOnce(new Error(''));
    fireEvent.click(screen.getByRole('button', { name: '测试', exact: true }));
    expect(await screen.findByText('测试连接失败')).toBeTruthy();
  });
});
