import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BackupPanel from '../src/components/BackupPanel';
import type { BackupList } from '../src/services/api/backupApi';

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), download: vi.fn() }));
vi.mock('../src/services/api/backupApi', () => ({
  backupApi: api,
  // keep the exported type shape importable for the test file itself
}));

function payload(overrides: Partial<BackupList> = {}): BackupList {
  return {
    items: [{ filename: 'backup-2026.zip', size: 2048, created_at: '2026-01-02T03:04:05Z' }],
    latest: { status: 'success', message: '备份完成', finished_at: '2026-01-02T03:04:06Z' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:download'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  api.list.mockResolvedValue(payload());
  api.create.mockResolvedValue(payload());
  api.download.mockResolvedValue(new Blob(['zip'], { type: 'application/zip' }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (URL as any).createObjectURL;
  delete (URL as any).revokeObjectURL;
});

async function panel() {
  render(<BackupPanel />);
  await screen.findByRole('button', { name: '创建完整备份' });
}

describe('BackupPanel', () => {
  it('lists finished backups with size, timestamp and the latest status', async () => {
    await panel();
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(screen.getByText('备份完成')).toBeTruthy();
    expect(screen.getByText('ZIP · 2.0 KB')).toBeTruthy();
    expect(screen.getByText('下载的 ZIP 可通过下方“导入数据”恢复。', { exact: false }).textContent)
      .toContain('导入数据');
    expect(screen.queryByText('暂无服务器备份')).toBeNull();
  });

  it('reports load failures with a retry through the refresh button', async () => {
    api.list.mockRejectedValueOnce(new Error('磁盘读取失败'));
    render(<BackupPanel />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('磁盘读取失败');
    fireEvent.click(screen.getByRole('button', { name: '刷新备份状态' }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('falls back to a generic load message for non-error rejections', async () => {
    api.list.mockRejectedValueOnce('boom');
    render(<BackupPanel />);
    expect((await screen.findByRole('alert')).textContent).toBe('无法加载备份，请重试');
  });

  it('shows the empty state when the server has no backups yet', async () => {
    api.list.mockResolvedValue(payload({ items: [], latest: null }));
    await panel();
    expect(screen.getByText('暂无服务器备份')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('marks failed, interrupted and unknown states as needing attention', async () => {
    api.list.mockResolvedValue(payload({ latest: { status: 'interrupted', message: '备份已中断' } }));
    await panel();
    const notice = screen.getByRole('alert');
    expect(notice.textContent).toContain('备份已中断');
    expect(notice.className).toContain('text-amber-900');
  });

  it('disables creation while a backup is running and keeps polling until it finishes', async () => {
    vi.useFakeTimers();
    api.list.mockResolvedValueOnce(payload({ latest: { status: 'running' } }))
      .mockResolvedValueOnce(payload()) // poll #1
      .mockResolvedValue(payload());   // poll #2 (interval already cleared)
    render(<BackupPanel />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('服务器正在创建备份，可稍后回来查看。')).toBeTruthy();
    expect((screen.getByRole('button', { name: '创建完整备份' }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(screen.getByText('备份完成')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(api.list).toHaveBeenCalledTimes(2); // polling stopped once idle
  });

  it('creates a backup and surfaces network failures without losing the panel state', async () => {
    await panel();
    fireEvent.click(screen.getByRole('button', { name: '创建完整备份' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());

    api.create.mockRejectedValueOnce(new Error('连接中断'));
    api.list.mockResolvedValueOnce(payload({ latest: { status: 'running' } }));
    fireEvent.click(screen.getByRole('button', { name: '创建完整备份' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('连接中断。请核对下方状态；网络中断不代表服务器已停止备份。');
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2)); // refreshed to inspect the server
    expect(screen.getByText('服务器正在创建备份，可稍后回来查看。')).toBeTruthy();
  });

  it('downloads a backup as a blob link and reports failures', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await panel();
    fireEvent.click(screen.getByRole('button', { name: '下载备份 backup-2026.zip' }));
    await waitFor(() => expect(api.download).toHaveBeenCalledWith('backup-2026.zip'));
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());

    api.download.mockRejectedValueOnce('gone');
    fireEvent.click(screen.getByRole('button', { name: '下载备份 backup-2026.zip' }));
    expect((await screen.findByRole('alert')).textContent).toBe('下载失败，请重试');
    click.mockRestore();
  });
});
