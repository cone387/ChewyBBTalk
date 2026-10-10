import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../src/services/auth', () => ({ getAccessToken: vi.fn() }))
import { getAccessToken } from '../src/services/auth'
import { dataApi } from '../src/services/api/dataApi'
const fetchMock = vi.fn(), file = new File(['{}'], 'backup.json', { type: 'application/json' })
function response(data: unknown = {}, status = 200) { return { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(data), blob: vi.fn().mockResolvedValue(new Blob(['exported'])) } }
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', fetchMock); vi.mocked(getAccessToken).mockReturnValue('access'); fetchMock.mockResolvedValue(response()) })
afterEach(() => vi.unstubAllGlobals())
it('exports binary data with explicit archive options and authentication', async () => {
  const result = await dataApi.exportData({ format: 'zip', include_attachments: true })
  expect(result.size).toBe(8)
  expect(fetchMock.mock.calls[0][0]).toContain('format=zip&include_attachments=true')
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer access')
})
it.each(['export', 'import', 'validate'])('does not send unauthenticated %s requests', async action => {
  vi.mocked(getAccessToken).mockReturnValue(null)
  await expect(action === 'export' ? dataApi.exportData() : action === 'import' ? dataApi.importData(file) : dataApi.validateImport(file)).rejects.toThrow('未登录')
  expect(fetchMock).not.toHaveBeenCalled()
})
it('submits multipart options including explicit false values without forcing JSON content type', async () => {
  const partial = { success: false, partial: true, stats: { errors: ['one missing attachment'] } }
  fetchMock.mockResolvedValue(response(partial))
  expect(await dataApi.importData(file, { overwrite_tags: false, skip_duplicates: true, import_storage_settings: false })).toEqual(partial)
  const options = fetchMock.mock.calls[0][1]
  expect(options.body.get('file').name).toBe('backup.json')
  expect(options.body.get('overwrite_tags')).toBe('false')
  expect(options.body.get('skip_duplicates')).toBe('true')
  expect(options.body.get('import_storage_settings')).toBe('false')
  expect(options.headers).not.toHaveProperty('Content-Type')
})
it.each(['export', 'import', 'validate'])('surfaces rejected %s responses including non-JSON export errors', async action => {
  fetchMock.mockResolvedValue(response({ detail: 'storage unavailable', valid: false }, 503))
  const request = () => action === 'export' ? dataApi.exportData() : action === 'import' ? dataApi.importData(file) : dataApi.validateImport(file)
  await expect(request()).rejects.toThrow('storage unavailable')
  if (action === 'export') {
    const invalid = response({}, 502); invalid.json.mockRejectedValue(new Error('html')); fetchMock.mockResolvedValue(invalid)
    await expect(request()).rejects.toThrow('导出失败')
  }
})
it('returns validation preview and counts without importing the file', async () => {
  const preview = { valid: true, version: '1.0', preview: { bbtalks_count: 3 } }
  fetchMock.mockResolvedValue(response(preview))
  expect(await dataApi.validateImport(file)).toEqual(preview)
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/data\/validate$/)
})
it('does not accept a failed HTTP validation response as a valid file', async () => {
  fetchMock.mockResolvedValue(response({ valid: true }, 500))
  await expect(dataApi.validateImport(file)).rejects.toThrow('文件验证失败')
})
