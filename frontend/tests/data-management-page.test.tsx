import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DataManagementPage from '../src/pages/DataManagementPage';
import type { ImportStats, ValidationResult } from '../src/services/api/dataApi';

const api = vi.hoisted(() => ({ exportData: vi.fn(), validateImport: vi.fn(), importData: vi.fn() }));
const boundary = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../src/services/api/dataApi', () => ({ dataApi: api }));
vi.mock('../src/components/BackupPanel', () => ({ default: () => <div>备份面板</div> }));
vi.mock('react-router-dom', () => ({ useNavigate: () => boundary.navigate }));

function stats(overrides: Partial<ImportStats> = {}): ImportStats {
  return {
    tags_created: 2, tags_skipped: 1, bbtalks_created: 5, bbtalks_skipped: 0,
    storage_settings_created: 0, attachments_created: 3, attachments_skipped: 0,
    comments_created: 4, comments_skipped: 0, errors: [],
    ...overrides,
  };
}
function validation(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    valid: true, file_type: 'json', version: '1.0',
    export_time: '2026-01-01T00:00:00Z',
    preview: { tags_count: 2, bbtalks_count: 5, storage_settings_count: 1, attachments_count: 3, comments_count: 4 },
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(window.URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true });
  Object.defineProperty(window.URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  api.exportData.mockResolvedValue(new Blob(['{}']));
  api.validateImport.mockResolvedValue(validation());
  api.importData.mockResolvedValue({ success: true, message: 'ok', stats: stats() });
});
afterEach(() => cleanup());

function chooseFile(name = 'backup.json') {
  const input = screen.getByLabelText('选择导入文件') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [new File(['{}'], name, { type: 'application/json' })], configurable: true });
  fireEvent.change(input);
}

describe('data export', () => {
  it('downloads a JSON export and reports success', async () => {
    render(<DataManagementPage />);
    fireEvent.click(screen.getByRole('button', { name: /导出数据/ }));
    expect(await screen.findByText('数据导出成功')).toBeTruthy();
    expect(api.exportData).toHaveBeenCalledWith({ format: 'json', include_attachments: false });
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('unlocks the attachment option for ZIP exports and forwards it', async () => {
    render(<DataManagementPage />);
    const attachments = screen.getByLabelText('包含附件文件（仅 ZIP 格式，文件较大）') as HTMLInputElement;
    expect(attachments.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'ZIP 压缩包' }));
    expect(attachments.disabled).toBe(false);
    fireEvent.click(attachments);
    fireEvent.click(screen.getByRole('button', { name: /导出数据/ }));
    await screen.findByText('数据导出成功');
    expect(api.exportData).toHaveBeenCalledWith({ format: 'zip', include_attachments: true });
  });

  it('surfaces export failures with the server message', async () => {
    api.exportData.mockRejectedValue(new Error('磁盘已满'));
    render(<DataManagementPage />);
    fireEvent.click(screen.getByRole('button', { name: /导出数据/ }));
    expect(await screen.findByText('磁盘已满')).toBeTruthy();
  });
});

describe('import validation', () => {
  it('validates the chosen file and opens the confirmation dialog with the preview', async () => {
    render(<DataManagementPage />);
    chooseFile('备份.json');
    const dialog = await screen.findByRole('dialog', { name: '确认导入' });
    expect(api.validateImport).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText('JSON')).toBeTruthy();
    expect(within(dialog).getByText('5 条')).toBeTruthy();
    expect(within(dialog).getByText('2 个')).toBeTruthy();
    expect(within(dialog).getByText('1 个')).toBeTruthy();
    expect(within(dialog).getByText('4 条')).toBeTruthy();
    expect(within(dialog).getByText('3 个')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.importData).not.toHaveBeenCalled();
  });

  it('reports invalid files and network errors without opening the dialog', async () => {
    render(<DataManagementPage />);
    api.validateImport.mockResolvedValue(validation({ valid: false, error: '文件格式错误' }));
    chooseFile();
    expect(await screen.findByText('文件验证失败: 文件格式错误')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    api.validateImport.mockRejectedValue(new Error('服务不可用'));
    chooseFile('again.json');
    expect(await screen.findByText('服务不可用')).toBeTruthy();
  });
});

describe('import execution', () => {
  it('imports with the chosen options and shows a success report that navigates home', async () => {
    render(<DataManagementPage />);
    chooseFile();
    const dialog = await screen.findByRole('dialog', { name: '确认导入' });
    fireEvent.click(within(dialog).getByLabelText('覆盖同名标签'));
    fireEvent.click(within(dialog).getByLabelText('跳过重复内容'));
    fireEvent.click(within(dialog).getByRole('button', { name: '开始导入' }));
    const report = await screen.findByRole('region', { name: '导入结果' });
    expect(api.importData).toHaveBeenCalledWith(expect.any(File), {
      skip_duplicates: false, overwrite_tags: true, import_storage_settings: false,
    });
    expect(within(report).getByText('数据导入成功')).toBeTruthy();
    expect(within(report).getByText(/新增 5 条内容、2 个标签、4 条评论、3 个附件。/)).toBeTruthy();
    expect(within(report).getByText(/跳过 0 条内容、1 个标签、0 条评论、0 个附件。/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(report).getByRole('button', { name: '查看记录' }));
    expect(boundary.navigate).toHaveBeenCalledWith('/');
  });

  it('flags partial imports and lists their errors', async () => {
    api.importData.mockResolvedValue({
      success: true, partial: true, message: 'done',
      stats: stats({ errors: ['标签重复：工作', '附件缺失：p.png'], attachments_skipped: 2 }),
    });
    render(<DataManagementPage />);
    chooseFile();
    const dialog = await screen.findByRole('dialog', { name: '确认导入' });
    fireEvent.click(within(dialog).getByRole('button', { name: '开始导入' }));
    const report = await screen.findByRole('region', { name: '导入结果' });
    expect(within(report).getByText('导入部分完成，请核对')).toBeTruthy();
    expect(within(report).getByRole('alert').textContent).toContain('部分数据未恢复');
    expect(within(report).getByText('标签重复：工作')).toBeTruthy();
    expect(within(report).getByText('附件缺失：p.png')).toBeTruthy();
  });

  it('keeps the flow recoverable when the import request fails', async () => {
    api.importData.mockRejectedValue(new Error('导入被拒'));
    render(<DataManagementPage />);
    chooseFile();
    const dialog = await screen.findByRole('dialog', { name: '确认导入' });
    fireEvent.click(within(dialog).getByRole('button', { name: '开始导入' }));
    expect(await screen.findByText('导入被拒')).toBeTruthy();
    // The file can simply be picked again for another attempt.
    api.importData.mockResolvedValue({ success: true, message: 'ok', stats: stats() });
    chooseFile();
    expect(await screen.findByRole('dialog', { name: '确认导入' })).toBeTruthy();
  });
});

describe('navigation', () => {
  it('returns to the settings page', () => {
    render(<DataManagementPage />);
    fireEvent.click(screen.getByLabelText('返回我的'));
    expect(boundary.navigate).toHaveBeenCalledWith('/settings');
  });
});
