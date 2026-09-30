import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import BBTalkEditor from '../src/components/BBTalkEditor';
import bbtalkReducer from '../src/store/slices/bbtalkSlice';
import tagReducer from '../src/store/slices/tagSlice';
import { draftKey, readDraft } from '../src/services/drafts';
import * as draftStorage from '../src/services/drafts';
import { readSubmission } from '../src/services/submissions';
import { ApiError } from '../src/services/api/apiClient';

const boundary = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null, status: vi.fn() }));
vi.mock('../src/services/auth', () => ({
  getCurrentUser: () => boundary.user, getAccessToken: () => 'token', refreshAccessToken: vi.fn(), logout: vi.fn(),
}));
vi.mock('../src/services/api/bbtalkApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/services/api/bbtalkApi')>();
  return { ...actual, bbtalkApi: { ...actual.bbtalkApi, submissionStatus: boundary.status } };
});
const scope = () => draftKey(import.meta.env.VITE_API_BASE_URL || '/', 1);
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('indexedDB', new IDBFactory());
  boundary.user = { id: 1 }; boundary.status.mockResolvedValue({ uid: 'record' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); vi.unstubAllGlobals(); });
function editor(publish = vi.fn().mockResolvedValue(undefined)) {
  const store = configureStore({ reducer: { bbtalk: bbtalkReducer, tag: tagReducer } });
  const view = render(<Provider store={store}><BBTalkEditor onPublish={publish} /></Provider>);
  return { ...view, publish };
}
async function input(text: string) {
  await waitFor(() => expect((screen.getByLabelText('记录内容').closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText('记录内容'), { target: { value: text } });
}
function submit() { fireEvent.click(screen.getByRole('button', { name: '发布', exact: true })); }
async function failedSubmission() {
  const publish = vi.fn().mockRejectedValue(new Error('response lost'));
  const view = editor(publish); await input('原来的正文'); submit();
  await screen.findByRole('alert');
  const original = await readSubmission(scope());
  expect(original?.state).toBe('pending');
  return { ...view, original: original! };
}
it('persists a unique publication identity before sending, then confirms and clears only after success', async () => {
  const publish = vi.fn(async data => {
    const intent = await readSubmission(scope());
    expect(intent?.state).toBe('pending');
    expect(data.submissionKey).toBe(intent?.key);
    expect(data.submissionKey).toMatch(/^[a-f0-9]{32}$/);
  });
  editor(publish); await input('#Work 正文'); submit();
  await waitFor(() => expect((screen.getByLabelText('记录内容') as HTMLTextAreaElement).value).toBe(''));
  expect(publish).toHaveBeenCalledWith(expect.objectContaining({ content: '正文', tags: ['Work'], visibility: 'private' }));
  expect(await readSubmission(scope())).toBeUndefined();
  expect((await readDraft(scope()))?.data).toBeNull();
});
it('keeps both draft and original key when the response is lost', async () => {
  const { publish, original } = await failedSubmission();
  expect(screen.getByRole('region', { name: '原提交恢复' }).textContent).toContain('待核对');
  expect((await readDraft(scope()))?.data?.content).toBe('原来的正文');
  expect(publish.mock.calls[0][0].submissionKey).toBe(original.key);
});
it('reloads the pending intent and its draft rather than inventing another submission', async () => {
  const first = await failedSubmission(); first.unmount();
  const second = editor();
  await screen.findByRole('region', { name: '原提交恢复' });
  await waitFor(() => expect((screen.getByLabelText('记录内容') as HTMLTextAreaElement).value).toBe('原来的正文'));
  expect((await readSubmission(scope()))?.key).toBe(first.original.key);
  expect(second.publish).not.toHaveBeenCalled();
});
it('blocks a new payload while the old publication outcome is unknown', async () => {
  const { publish, original } = await failedSubmission();
  await input('后来的修改'); submit();
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('先核对或重试原提交'));
  expect(publish).toHaveBeenCalledTimes(1);
  expect((await readSubmission(scope()))?.key).toBe(original.key);
  expect((await readDraft(scope()))?.data?.content).toBe('后来的修改');
});
it('retry sends the original body and original key, preserving later edits', async () => {
  const { publish, original } = await failedSubmission();
  publish.mockResolvedValue(undefined); await input('后来的修改');
  fireEvent.click(screen.getByRole('button', { name: '重试原提交' }));
  await waitFor(() => expect(screen.getByRole('region', { name: '原提交恢复' }).textContent).toContain('已处理'));
  expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ content: '原来的正文', submissionKey: original.key }));
  expect((screen.getByLabelText('记录内容') as HTMLTextAreaElement).value).toBe('后来的修改');
  expect((await readDraft(scope()))?.data?.content).toBe('后来的修改');
  expect((await readSubmission(scope()))?.state).toBe('confirmed');
});
it('checking an outcome never posts another record', async () => {
  const { publish, original } = await failedSubmission();
  fireEvent.click(screen.getByRole('button', { name: '核对发布结果' }));
  await waitFor(() => expect(screen.getByRole('region', { name: '原提交恢复' }).textContent).toContain('已处理'));
  expect(boundary.status).toHaveBeenCalledWith(original.key);
  expect(publish).toHaveBeenCalledTimes(1);
});
it('a missing outcome stays pending and permits retry with the same identity', async () => {
  const { original } = await failedSubmission();
  boundary.status.mockRejectedValue(new ApiError('not found', 404));
  fireEvent.click(screen.getByRole('button', { name: '核对发布结果' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('暂未查到'));
  expect((await readSubmission(scope()))?.key).toBe(original.key);
  expect((await readSubmission(scope()))?.state).toBe('pending');
});
it('a deleted original record is treated as handled and is never recreated', async () => {
  await failedSubmission(); boundary.status.mockRejectedValue(new ApiError('gone', 410));
  fireEvent.click(screen.getByRole('button', { name: '核对发布结果' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('不会重新创建'));
  expect(screen.queryByRole('button', { name: '重试原提交' })).toBeNull();
  expect((await readSubmission(scope()))?.state).toBe('confirmed');
});
it('rejects another account attempting recovery of the original account draft', async () => {
  const { publish } = await failedSubmission(); boundary.user = { id: 2 };
  fireEvent.click(screen.getByRole('button', { name: '重试原提交' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('核对或重试失败'));
  expect(publish).toHaveBeenCalledTimes(1);
  expect((await readSubmission(scope()))?.state).toBe('pending');
});
it('does not clear the original draft if the account changes while publication is pending', async () => {
  let finish!: () => void;
  const publish = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  editor(publish); await input('原账号的输入'); submit();
  await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
  boundary.user = { id: 2 };
  await act(async () => finish());
  expect((await readDraft(scope()))?.data?.content).toBe('原账号的输入');
  expect((await readSubmission(scope()))?.state).toBe('pending');
});
it('keeps the form and confirmed identity when server publication succeeds but local cleanup fails', async () => {
  const write = draftStorage.writeDraft;
  vi.spyOn(draftStorage, 'writeDraft').mockImplementation((key, data, revision) =>
    data === null ? Promise.reject(new Error('quota exceeded')) : write(key, data, revision));
  const { publish } = editor(); await input('清理失败仍保留'); submit();
  await screen.findByText('发布成功，但本地草稿清理失败，请刷新后核对');
  expect((screen.getByLabelText('记录内容') as HTMLTextAreaElement).value).toBe('清理失败仍保留');
  expect((await readSubmission(scope()))?.state).toBe('confirmed');
  expect(publish).toHaveBeenCalledTimes(1);
});
