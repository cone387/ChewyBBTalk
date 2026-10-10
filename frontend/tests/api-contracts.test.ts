import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../src/services/api/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), download: vi.fn() } }))
import { apiClient } from '../src/services/api/apiClient'
import { bbtalkApi, transformBBTalk } from '../src/services/api/bbtalkApi'
import { tagApi } from '../src/services/api/tagApi'
import { settingsApi } from '../src/services/api/settingsApi'
import { backupApi } from '../src/services/api/backupApi'
const wire = { uid: 'record', content: 'body', create_time: 'created', update_time: 'updated' }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(apiClient.post).mockResolvedValue(wire); vi.mocked(apiClient.patch).mockResolvedValue(wire) })
afterEach(() => vi.unstubAllGlobals())
it('maps record defaults and profile-independent metadata without losing attachment details', () => {
  expect(transformBBTalk(wire)).toMatchObject({ id: 'record', visibility: 'private', tags: [], attachments: [], context: {}, isPinned: false, commentCount: 0 })
  const record = transformBBTalk({ ...wire, is_pinned: true, comment_count: 2, tags: [{ uid: 'tag', name: 'Work', sort_order: 1 }], attachments: [{ id: 'file', url: '/preview/', original_filename: 'name', file_size: 5, mime_type: 'image/jpeg' }] })
  expect(record.tags[0]).toMatchObject({ id: 'tag', sortOrder: 1 })
  expect(record.attachments[0]).toMatchObject({ uid: 'file', url: '/preview/', type: 'file', originalFilename: 'name', fileSize: 5 })
  expect(record).toMatchObject({ isPinned: true, commentCount: 2, createdAt: 'created', updatedAt: 'updated' })
})
it('serializes publication identity, tag names and attachment metadata', async () => {
  await bbtalkApi.createBBTalk({ submissionKey: 'intent', content: 'body', tags: ['Work', 'Life'], visibility: 'private', attachments: [{ uid: 'file', url: '/file', type: 'image', originalFilename: 'original.jpg', mimeType: 'image/jpeg', fileSize: 5 }] })
  expect(apiClient.post).toHaveBeenCalledWith('/api/v1/bbtalk', expect.objectContaining({ content: 'body', tags: ['Work', 'Life'], visibility: 'private', attachments: [expect.objectContaining({ original_filename: 'original.jpg', mime_type: 'image/jpeg', file_size: 5 })] }), { 'Idempotency-Key': 'intent' })
})
it('preserves explicit clearing and optimistic concurrency when editing', async () => {
  await bbtalkApi.updateBBTalk('record', { content: '', tags: [], attachments: [], context: {}, visibility: 'private' }, 'revision')
  expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/bbtalk/record', { content: '', tags: [], attachments: [], context: {}, visibility: 'private' }, { 'If-Match': 'revision' })
  await bbtalkApi.updateBBTalk('record', {})
  expect(apiClient.patch).toHaveBeenLastCalledWith('/api/v1/bbtalk/record', {}, undefined)
})
it('preserves pagination markers and filtering on public and private lists', async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ count: 3, next: 'next', previous: null, results: [wire] })
  expect(await bbtalkApi.getBBTalks({ search: 'body', has_attachments: false })).toMatchObject({ count: 3, next: 'next', results: [{ id: 'record' }] })
  expect(apiClient.get).toHaveBeenCalledWith('/api/v1/bbtalk', { search: 'body', has_attachments: false })
  expect((await bbtalkApi.getPublicBBTalks({ page: 2 })).results[0].id).toBe('record')
})
it('loads public records without credentials and reports denied or missing records', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => wire }).mockResolvedValueOnce({ ok: false })
  vi.stubGlobal('fetch', fetchMock)
  expect((await bbtalkApi.getPublicBBTalk('record')).id).toBe('record')
  expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
  await expect(bbtalkApi.getPublicBBTalk('private')).rejects.toThrow('不是公开')
})
it('maps comments even when profile fields are absent, without losing rich profiles', async () => {
  const comment = { uid: 'comment', user: 1, content: 'reply', create_time: 'created' }
  vi.mocked(apiClient.get).mockResolvedValue([comment, { ...comment, user_display_name: 'Alice', user_avatar: 'avatar', user_username: 'alice' }])
  const comments = await bbtalkApi.getComments('record')
  expect(comments[0]).toMatchObject({ userDisplayName: '', userAvatar: '', userUsername: '' })
  expect(comments[1]).toMatchObject({ userDisplayName: 'Alice', userAvatar: 'avatar', userUsername: 'alice' })
  vi.mocked(apiClient.post).mockResolvedValue(comment)
  expect(await bbtalkApi.createComment('record', 'reply')).toMatchObject({ uid: 'comment', content: 'reply' })
  await bbtalkApi.deleteComment('record', 'comment')
  expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/bbtalk/record/comments/comment')
})
it('uses the anonymous public comment endpoint without losing the UID path separator', async () => {
  vi.mocked(apiClient.get).mockResolvedValue([])
  await bbtalkApi.getComments('record', true)
  expect(apiClient.get).toHaveBeenCalledWith('/api/v1/bbtalk/public/record/comments')
  await bbtalkApi.getComments('record')
  expect(apiClient.get).toHaveBeenLastCalledWith('/api/v1/bbtalk/record/comments')
})
it.each([[{ uid: 'tag', name: 'Work' }], { results: [{ uid: 'tag', name: 'Work' }] }, {}])('accepts compatible tag response shapes %j', async payload => {
  vi.mocked(apiClient.get).mockResolvedValue(payload)
  const tags = await tagApi.getTags()
  expect(tags).toEqual('results' in payload || Array.isArray(payload) ? [expect.objectContaining({ id: 'tag' })] : [])
})
it('preserves cleared tag fields and zero ordering without sending undefined fields', async () => {
  await tagApi.createTag({ name: 'Work', color: '#000000', sortOrder: 0 })
  expect(apiClient.post).toHaveBeenCalledWith('/api/v1/bbtalk/tags', { name: 'Work', color: '#000000', sort_order: 0 })
  await tagApi.updateTag('tag', { name: '', color: '', sortOrder: 0 })
  expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/bbtalk/tags/tag', { name: '', color: '', sort_order: 0 })
  await tagApi.updateTag('tag', {})
  expect(apiClient.patch).toHaveBeenLastCalledWith('/api/v1/bbtalk/tags/tag', {})
})
it('encodes backup filenames so they cannot become URL path segments', async () => {
  vi.mocked(apiClient.download).mockResolvedValue(new Blob(['backup']))
  await backupApi.download('../backup #1.zip')
  expect(apiClient.download).toHaveBeenCalledWith('/api/v1/bbtalk/data/backups/..%2Fbackup%20%231.zip')
})
it('preserves null local storage targets and propagates migration failures', async () => {
  vi.mocked(apiClient.post).mockResolvedValueOnce({ total: 3, need_migrate: 2 }).mockRejectedValueOnce(new Error('target unavailable'))
  expect(await settingsApi.migrationPreview(null)).toMatchObject({ total: 3, need_migrate: 2 })
  expect(apiClient.post).toHaveBeenCalledWith('/api/v1/bbtalk/storage/migration/preview', { target_config_id: null })
  await expect(settingsApi.migrationExecute(7)).rejects.toThrow('target unavailable')
  expect(apiClient.post).toHaveBeenLastCalledWith('/api/v1/bbtalk/storage/migration/execute', { target_config_id: 7 })
})

const storagePayload = { name: 'archive', storage_type: 's3' as const, s3_bucket_name: 'photos' }
const storageRequests = [
  { name: 'list', call: () => settingsApi.listStorageSettings(), method: 'get', args: ['/api/v1/bbtalk/settings/storage'] },
  { name: 'active', call: () => settingsApi.getActiveStorageSettings(), method: 'get', args: ['/api/v1/bbtalk/settings/storage/active'] },
  { name: 'create', call: () => settingsApi.createStorageSettings(storagePayload), method: 'post', args: ['/api/v1/bbtalk/settings/storage', storagePayload] },
  { name: 'update', call: () => settingsApi.updateStorageSettings(7, storagePayload), method: 'patch', args: ['/api/v1/bbtalk/settings/storage/7', storagePayload] },
  { name: 'delete', call: () => settingsApi.deleteStorageSettings(7), method: 'delete', args: ['/api/v1/bbtalk/settings/storage/7'] },
  { name: 'activate', call: () => settingsApi.activateStorageSettings(7), method: 'post', args: ['/api/v1/bbtalk/settings/storage/7/activate'] },
  { name: 'deactivate all', call: () => settingsApi.deactivateAllStorage(), method: 'post', args: ['/api/v1/bbtalk/settings/storage/deactivate-all'] },
  { name: 'test active', call: () => settingsApi.testStorageConnection(), method: 'post', args: ['/api/v1/bbtalk/settings/storage/test'] },
  { name: 'test selected', call: () => settingsApi.testStorageConnectionById(7), method: 'post', args: ['/api/v1/bbtalk/settings/storage/7/test'] },
] as const

it.each(storageRequests)('sends the storage $name contract and preserves responses', async ({ call, method, args }) => {
  const response = { id: 7, name: 'archive', success: true }
  vi.mocked(apiClient[method]).mockResolvedValue(response)
  expect(await call()).toBe(response)
  expect(apiClient[method]).toHaveBeenCalledExactlyOnceWith(...args)
})

it.each(storageRequests)('propagates storage $name failures without reporting success', async ({ call, method }) => {
  const error = new Error('storage unavailable')
  vi.mocked(apiClient[method]).mockRejectedValue(error)
  await expect(call()).rejects.toBe(error)
})

it.each([
  { name: 'list', call: () => backupApi.list(), method: 'get' },
  { name: 'create', call: () => backupApi.create(), method: 'post' },
] as const)('sends the backup $name contract and propagates errors', async ({ call, method }) => {
  const response = { items: [], latest: { status: 'running' } }
  vi.mocked(apiClient[method]).mockResolvedValueOnce(response)
  expect(await call()).toBe(response)
  expect(apiClient[method]).toHaveBeenCalledExactlyOnceWith('/api/v1/bbtalk/data/backups')
  const error = new Error('backup unavailable')
  vi.mocked(apiClient[method]).mockRejectedValueOnce(error)
  await expect(call()).rejects.toBe(error)
})
