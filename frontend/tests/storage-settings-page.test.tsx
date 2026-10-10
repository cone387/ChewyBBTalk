import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import StorageSettingsPage from '../src/pages/StorageSettingsPage';

const boundary = vi.hoisted(() => ({ navigate: vi.fn(), api: {
  listStorageSettings: vi.fn(), deactivateAllStorage: vi.fn(), migrationPreview: vi.fn(), migrationExecute: vi.fn(),
} }));
vi.mock('react-router-dom', () => ({ useNavigate: () => boundary.navigate }));
vi.mock('../src/services/api/settingsApi', () => ({ settingsApi: boundary.api }));
const configs = [{ id: 7, name: 'Personal S3', storage_type: 's3', is_active: true }, { id: 8, name: 'Archive', storage_type: 's3', is_active: false }];
beforeEach(() => {
  vi.resetAllMocks();
  boundary.api.listStorageSettings.mockResolvedValue(configs);
  boundary.api.deactivateAllStorage.mockResolvedValue(undefined);
  boundary.api.migrationPreview.mockResolvedValue({ total: 3, need_migrate: 2, already_on_target: 1 });
  boundary.api.migrationExecute.mockResolvedValue({ success: true, stats: { total: 3, migrated: 2, skipped: 1, failed: 0, errors: [] } });
});
afterEach(() => cleanup());
async function page() { render(<StorageSettingsPage />); await screen.findByText(/正在使用: Personal S3/); }
async function migration() {
  await page();
  fireEvent.click(screen.getByRole('button', { name: /迁移到 Archive/ }));
  const dialog = await screen.findByRole('dialog', { name: '迁移数据到「Archive」' });
  await within(dialog).findByRole('button', { name: '开始迁移 2 个文件' });
  return dialog;
}
it('shows loading until the server has confirmed the active configuration', async () => {
  let finish!: (value: typeof configs) => void;
  boundary.api.listStorageSettings.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<StorageSettingsPage />);
  expect(screen.getByText('加载中...')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^服务器存储/ })).toBeNull();
  await act(async () => finish(configs));
  expect(screen.getByText(/正在使用: Personal S3/)).toBeTruthy();
});
it('uses server storage when the configuration list is empty and avoids redundant switch requests', async () => {
  boundary.api.listStorageSettings.mockResolvedValue([]);
  render(<StorageSettingsPage />);
  const server = await screen.findByRole('button', { name: /服务器存储.*当前使用/ });
  fireEvent.click(server);
  expect(boundary.api.deactivateAllStorage).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /迁移到 Archive/ })).toBeNull();
});
it('navigates back to settings or to the S3 configuration list', async () => {
  await page();
  fireEvent.click(screen.getByRole('button', { name: '返回我的' }));
  expect(boundary.navigate).toHaveBeenCalledWith('/settings');
  fireEvent.click(screen.getByRole('button', { name: /S3 兼容存储/ }));
  expect(boundary.navigate).toHaveBeenLastCalledWith('/settings/storage/s3');
});
it('changes the displayed active storage only after a successful switch', async () => {
  let finish!: () => void;
  boundary.api.deactivateAllStorage.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await page(); fireEvent.click(screen.getByRole('button', { name: /^服务器存储/ }));
  expect(screen.getByText(/正在使用: Personal S3/)).toBeTruthy();
  expect((screen.getByRole('button', { name: /^服务器存储/ }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finish());
  expect(screen.getByText('已切换为服务器存储')).toBeTruthy();
  expect(screen.getByRole('button', { name: /服务器存储.*当前使用/ })).toBeTruthy();
});
it('keeps the old configuration visible and enables retry when switching fails', async () => {
  boundary.api.deactivateAllStorage.mockRejectedValueOnce(new Error('配置服务不可用'));
  await page(); fireEvent.click(screen.getByRole('button', { name: /^服务器存储/ }));
  await screen.findByText('配置服务不可用');
  expect(screen.getByText(/正在使用: Personal S3/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^服务器存储/ }));
  await screen.findByText('已切换为服务器存储');
  expect(boundary.api.deactivateAllStorage).toHaveBeenCalledTimes(2);
});
it('requires preview before migration and sends the selected target id', async () => {
  const dialog = await migration();
  expect(boundary.api.migrationPreview).toHaveBeenCalledWith(8);
  expect(boundary.api.migrationExecute).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: '开始迁移 2 个文件' }));
  await within(dialog).findByText('迁移成功');
  expect(boundary.api.migrationExecute).toHaveBeenCalledWith(8);
  expect(within(dialog).getByText('成功迁移: 2')).toBeTruthy();
  fireEvent.click(within(dialog).getAllByRole('button', { name: '关闭', exact: true })[0]);
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('uses null as the server-storage migration target', async () => {
  await page(); fireEvent.click(screen.getByRole('button', { name: /迁移到服务器存储/ }));
  await screen.findByRole('button', { name: '开始迁移 2 个文件' });
  expect(boundary.api.migrationPreview).toHaveBeenCalledWith(null);
  fireEvent.click(screen.getByRole('button', { name: '开始迁移 2 个文件' }));
  await screen.findByText('迁移成功');
  expect(boundary.api.migrationExecute).toHaveBeenCalledWith(null);
});
it('never offers an execution button when every attachment is already on target', async () => {
  boundary.api.migrationPreview.mockResolvedValue({ total: 3, need_migrate: 0, already_on_target: 3 });
  await page(); fireEvent.click(screen.getByRole('button', { name: /迁移到 Archive/ }));
  await screen.findByText('所有附件已在目标存储，无需迁移');
  expect(screen.queryByRole('button', { name: /开始迁移/ })).toBeNull();
  expect(boundary.api.migrationExecute).not.toHaveBeenCalled();
});
it('shows preview failures without allowing migration', async () => {
  boundary.api.migrationPreview.mockRejectedValue(new Error('无法读取附件'));
  await page(); fireEvent.click(screen.getByRole('button', { name: /迁移到 Archive/ }));
  await screen.findByText('无法读取附件');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(boundary.api.migrationExecute).not.toHaveBeenCalled();
});
it('retains the preview for retry after migration execution fails', async () => {
  boundary.api.migrationExecute.mockRejectedValueOnce(new Error('存储连接失败'));
  const dialog = await migration(); fireEvent.click(within(dialog).getByRole('button', { name: '开始迁移 2 个文件' }));
  await screen.findByText('存储连接失败');
  fireEvent.click(within(dialog).getByRole('button', { name: '开始迁移 2 个文件' }));
  await within(dialog).findByText('迁移成功');
  expect(boundary.api.migrationExecute).toHaveBeenCalledTimes(2);
});
it('reports partial failures explicitly with per-file errors', async () => {
  boundary.api.migrationExecute.mockResolvedValue({ success: false, stats: { total: 3, migrated: 1, skipped: 1, failed: 1, errors: ['file.jpg: target unavailable'] } });
  const dialog = await migration(); fireEvent.click(within(dialog).getByRole('button', { name: '开始迁移 2 个文件' }));
  await within(dialog).findByText('迁移完成（部分失败）');
  expect(within(dialog).getByText('失败: 1')).toBeTruthy();
  expect(within(dialog).getByText('file.jpg: target unavailable')).toBeTruthy();
  expect(screen.queryByText(/迁移完成！/)).toBeNull();
});
it('blocks closing the modal while files are being migrated', async () => {
  let finish!: (value: unknown) => void;
  boundary.api.migrationExecute.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const dialog = await migration(); fireEvent.click(within(dialog).getByRole('button', { name: '开始迁移 2 个文件' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect((within(dialog).getByRole('button', { name: '迁移中...' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finish({ success: true, stats: { migrated: 2, skipped: 1, failed: 0, errors: [] } }));
  await within(dialog).findByText('迁移成功');
});
it('shows load failure and allows retry instead of incorrectly claiming server storage is active', async () => {
  boundary.api.listStorageSettings.mockRejectedValueOnce(new Error('offline'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<StorageSettingsPage />);
  await screen.findByText('无法读取存储状态，请重试');
  expect(screen.queryByRole('button', { name: /服务器存储.*当前使用/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  await screen.findByText(/正在使用: Personal S3/);
  await waitFor(() => expect(boundary.api.listStorageSettings).toHaveBeenCalledTimes(2));
});
