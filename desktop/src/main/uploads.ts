import { app, BrowserWindow } from 'electron';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { store } from './store';
import { assertSession } from './submissions';
import { authenticatedFetch } from './auth';
import type { UploadItem, SubmissionSession } from '../shared/ipc-types';

const running = new Set<string>();
function filePath(scope: string, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('无效附件');
  return join(app.getPath('userData'), 'draft-files', createHash('sha256').update(scope).digest('hex'), id);
}
function read(scope: string): UploadItem[] { return store.get('compose.uploads')?.[scope] || []; }
function save(scope: string, items: UploadItem[]) {
  store.set('compose.uploads', { ...store.get('compose.uploads'), [scope]: items });
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('uploads:changed', scope);
}
export function listUploads(session: SubmissionSession): UploadItem[] {
  assertSession(session);
  const items = read(session.scope).map(item => item.status === 'uploading' && !running.has(item.id)
    ? { ...item, status: 'failed' as const, error: '上传中断，请重试' } : item);
  return items;
}
export async function stageUpload(session: SubmissionSession, file: { name: string; mimeType: string; bytes: Uint8Array }): Promise<UploadItem> {
  assertSession(session);
  const bytes = Buffer.from(file.bytes);
  if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new Error('文件为空或超过 100 MB');
  const id = randomUUID();
  const path = filePath(session.scope, id);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, bytes);
  try { assertSession(session); } catch (error) { await unlink(path); throw error; }
  const kind = file.mimeType.split('/')[0];
  const item: UploadItem = { id, name: file.name || 'screenshot.png', mimeType: file.mimeType || 'application/octet-stream',
    fileSize: bytes.length, type: ['image', 'video', 'audio'].includes(kind) ? kind as UploadItem['type'] : 'file', status: 'queued' };
  save(session.scope, [...read(session.scope), item]);
  void retryUpload(session, id).catch(() => {});
  return item;
}
export async function retryUpload(session: SubmissionSession, id: string): Promise<void> {
  assertSession(session);
  if (running.has(id)) return;
  let item = read(session.scope).find(file => file.id === id);
  if (!item || item.status === 'uploaded') return;
  running.add(id);
  const update = (changes: Partial<UploadItem>) => save(session.scope, read(session.scope).map(file => file.id === id ? { ...file, ...changes } : file));
  update({ status: 'uploading', error: undefined });
  try {
    const bytes = await readFile(filePath(session.scope, id));
    assertSession(session);
    const body = new FormData();
    body.append('file', new Blob([new Uint8Array(bytes)], { type: item.mimeType }), item.name);
    body.append('is_public', 'false');
    const response = await authenticatedFetch('/api/v1/attachments/files/', { method: 'POST', body }, session.generation);
    const data = await response.json().catch(() => ({}));
    assertSession(session);
    if (!response.ok) throw new Error(response.status === 413 ? '文件太大，请压缩后重试' : data.detail || data.file?.join?.('; ') || `上传失败 (${response.status})`);
    const uid = String(data.uid || data.id || '');
    if (!uid) throw new Error('服务器未返回附件编号');
    update({ status: 'uploaded', uid, error: undefined });
  } catch (error) {
    update({ status: 'failed', error: error instanceof Error ? error.message : '上传失败' });
  } finally { running.delete(id); }
}
export async function removeUpload(session: SubmissionSession, id: string) {
  assertSession(session);
  if (running.has(id)) throw new Error('请等待此附件上传完成再移除');
  save(session.scope, read(session.scope).filter(item => item.id !== id));
  await unlink(filePath(session.scope, id)).catch(() => {});
}
export async function clearUploads(session: SubmissionSession) {
  assertSession(session);
  const items = read(session.scope);
  if (items.some(item => running.has(item.id))) throw new Error('附件仍在上传');
  save(session.scope, []);
  await Promise.all(items.map(item => unlink(filePath(session.scope, item.id)).catch(() => {})));
}
export async function previewUpload(session: SubmissionSession, id: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  assertSession(session);
  const item = read(session.scope).find(file => file.id === id);
  if (!item) throw new Error('附件不存在');
  try {
    const bytes = await readFile(filePath(session.scope, id));
    assertSession(session);
    return { bytes: new Uint8Array(bytes), mimeType: item.mimeType };
  } catch (error) {
    assertSession(session);
    if (!item.uid) throw error;
    const response = await authenticatedFetch(`/api/v1/attachments/files/${encodeURIComponent(item.uid)}/preview/`, {}, session.generation);
    if (!response.ok) throw new Error('无法加载预览，请重试');
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertSession(session);
    return { bytes, mimeType: response.headers.get('Content-Type') || item.mimeType };
  }
}
