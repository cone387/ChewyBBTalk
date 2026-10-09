import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StatusPage from '../src/pages/StatusPage';

const client = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../src/services/api/apiClient', () => ({ apiClient: client }));
vi.mock('react-router-dom', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));

const base = {
  checked_at: '2026-10-01T08:00:00Z',
  service: { status: 'ok', message: '服务正常' },
  storage: { status: 'ok', message: '存储可用', mode: 's3' },
  backup: { status: 'success', message: '备份完成', count: 3, latest_completed_at: '2026-10-01T07:00:00Z', latest_size: 2097152 },
};

beforeEach(() => {
  vi.resetAllMocks();
  client.get.mockResolvedValue(base);
});
afterEach(() => cleanup());

function okText(section: HTMLElement, text: string) {
  expect(within(section).getByText(text)).toBeTruthy();
}

describe('status loading', () => {
  it('shows the initial loading state and the checked timestamp after success', async () => {
    render(<StatusPage />);
    expect(screen.getByRole('status').textContent).toContain('正在检查服务、存储和备份');
    expect((screen.getByRole('button', { name: '正在检查…' }) as HTMLButtonElement).disabled).toBe(true);
    await screen.findByText('服务连接');
    expect(client.get).toHaveBeenCalledWith('/api/v1/bbtalk/settings/status/');
    expect(screen.getByRole('button', { name: '重新检查' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(/检查时间：/).textContent).toContain('2026');
    okText(screen.getByText('服务连接').closest('section')!, '正常');
  });

  it('reports a failed check with a retry that recovers', async () => {
    client.get.mockRejectedValueOnce(new Error('offline'));
    render(<StatusPage />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('无法获取运行状态，请检查网络后重试');
    client.get.mockResolvedValue(base);
    fireEvent.click(screen.getByRole('button', { name: '重新检查' }));
    await screen.findByText('服务连接');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the previous result visible while a refresh fails', async () => {
    render(<StatusPage />);
    await screen.findByText('服务连接');
    client.get.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: '重新检查' }));
    const alert = await screen.findByRole('alert');
    expect(screen.getByText('服务连接')).toBeTruthy();
    expect(screen.getByText(/上次结果/)).toBeTruthy();
    expect(alert).toBeTruthy();
  });
});

describe('status cards', () => {
  it('renders storage and backup details with humanised sizes', async () => {
    render(<StatusPage />);
    await screen.findByText('当前存储');
    okText(screen.getByText('当前存储').closest('section')!, '个人 S3 存储');
    const backup = screen.getByText('最近备份').closest('section')!;
    okText(backup, '可用备份：3 份');
    okText(backup, /最近可用备份：/);
    okText(backup, /2 MB/);
    okText(backup, '管理与创建备份');
    expect(screen.queryByText('管理员诊断')).toBeNull();
  });

  it.each([
    ['server', '服务器存储'],
    ['server_s3', '服务器 S3 存储'],
    ['unknown', '未能读取存储配置'],
    ['exotic', '未识别存储类型'],
  ])('labels the %s storage mode as %s', async (mode, label) => {
    client.get.mockResolvedValue({ ...base, storage: { ...base.storage, mode } });
    render(<StatusPage />);
    await screen.findByText('当前存储');
    okText(screen.getByText('当前存储').closest('section')!, label);
  });

  it.each([
    ['running', '进行中'],
    ['interrupted', '已中断'],
    ['none', '尚未备份'],
    ['missing-label', '待核对'],
  ])('maps backup status %s to its label', async (status, label) => {
    client.get.mockResolvedValue({ ...base, backup: { status, message: '备份情况' } });
    render(<StatusPage />);
    const section = (await screen.findByText('最近备份')).closest('section')!;
    okText(section, label);
    expect(within(section).queryByText(/可用备份/)).toBeNull();
    expect(within(section).queryByText(/最近可用备份/)).toBeNull();
  });

  it('marks failing checks and formats zero-byte backups', async () => {
    client.get.mockResolvedValue({
      ...base,
      service: { status: 'error', message: '连接被拒绝' },
      backup: { status: 'failed', message: '备份失败', count: 0, latest_completed_at: null, latest_size: null },
    });
    render(<StatusPage />);
    await screen.findByText('运行状态');
    const service = screen.getByText('服务连接').closest('section')!;
    okText(service, '检查失败');
    okText(service, '连接被拒绝');
    const backup = screen.getByText('最近备份').closest('section')!;
    okText(backup, '失败');
    okText(backup, '可用备份：0 份');
    expect(within(backup).queryByText(/最近可用备份/)).toBeNull();
  });

  it('renders admin diagnostics with disk usage when present', async () => {
    client.get.mockResolvedValue({
      ...base,
      diagnostics: {
        database: { status: 'ok', message: '数据库正常' },
        attachment_disk: { status: 'ok', message: '磁盘正常', free_bytes: 52428800, total_bytes: 104857600 },
      },
    });
    render(<StatusPage />);
    const heading = await screen.findByText('管理员诊断');
    expect(heading).toBeTruthy();
    okText(screen.getByText('数据库').closest('section')!, '数据库正常');
    const disk = screen.getByText('服务器磁盘').closest('section')!;
    okText(disk, '剩余 50 MB / 共 100 MB');
  });

  it('falls back to zero bytes when size fields are missing', async () => {
    client.get.mockResolvedValue({
      ...base,
      backup: { ...base.backup, latest_size: undefined },
      diagnostics: {
        database: { status: 'ok', message: '数据库正常' },
        attachment_disk: { status: 'ok', message: '磁盘正常', free_bytes: 1024 * 1024 },
      },
    });
    render(<StatusPage />);
    const backup = (await screen.findByText('最近备份')).closest('section')!;
    okText(backup, /最近可用备份：.*0 MB/);
    const disk = screen.getByText('服务器磁盘').closest('section')!;
    okText(disk, '剩余 1 MB / 共 0 MB');
  });

  it('omits the disk usage line when byte counts are unavailable', async () => {
    client.get.mockResolvedValue({
      ...base,
      diagnostics: {
        database: { status: 'unknown', message: '等待检查' },
        attachment_disk: { status: 'unknown', message: '等待检查' },
      },
    });
    render(<StatusPage />);
    const disk = (await screen.findByText('服务器磁盘')).closest('section')!;
    okText(disk, '待核对');
    expect(within(disk).queryByText(/剩余/)).toBeNull();
  });
});

describe('refresh lifecycle', () => {
  it('ignores the response of a refresh superseded by unmounting', async () => {
    let finish!: (value: unknown) => void;
    client.get.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<StatusPage />);
    view.unmount();
    finish(base);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
