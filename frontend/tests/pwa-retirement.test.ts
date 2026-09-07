import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'
import { retireLegacyPwa } from '../src/services/retireLegacyPwa'

afterEach(() => vi.unstubAllGlobals())

it('leaves unrelated caches untouched for a new visitor without a legacy registration', async () => {
  vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [] } })
  const remove = vi.fn()
  vi.stubGlobal('caches', { keys: async () => ['api-cache'], delete: remove })
  await retireLegacyPwa()
  expect(remove).not.toHaveBeenCalled()
})

it('unregisters only this application worker and deletes only its historical caches', async () => {
  const scope = `${window.location.origin}/`
  const unregister = vi.fn()
  const unrelated = vi.fn()
  vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [
    { scope, active: { scriptURL: `${scope}sw.js` }, unregister },
    { scope: `${scope}other/`, active: { scriptURL: `${scope}other/sw.js` }, unregister: unrelated },
  ] } })
  const remove = vi.fn()
  vi.stubGlobal('caches', { keys: async () => [`workbox-precache-v2-${scope}`, `workbox-precache-v2-${scope}other/`, 'api-cache', 'unrelated'], delete: remove })
  await retireLegacyPwa()
  expect(unregister).toHaveBeenCalledOnce()
  expect(unrelated).not.toHaveBeenCalled()
  expect(remove.mock.calls.map(([key]) => key)).toEqual([`workbox-precache-v2-${scope}`, 'api-cache'])
})

it('updates legacy installs with a worker that retires itself without intercepting fetch or navigating clients', async () => {
  const handlers = new Map<string, (event: { waitUntil(promise: Promise<unknown>): void }) => void>()
  const unregister = vi.fn()
  const claim = vi.fn()
  const skipWaiting = vi.fn()
  const remove = vi.fn()
  const scope = 'https://example.test/notes/'
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    URL,
    self: { addEventListener: (name: string, callback: typeof handlers extends Map<string, infer V> ? V : never) => handlers.set(name, callback),
      skipWaiting, registration: { scope, unregister }, clients: { claim } },
    caches: { keys: async () => [`workbox-precache-v2-${scope}`, 'api-cache', 'other'], delete: remove },
  })
  let pending: Promise<unknown> | undefined
  const event = { waitUntil: (promise: Promise<unknown>) => { pending = promise } }
  handlers.get('install')!(event)
  await pending
  handlers.get('activate')!(event)
  await pending
  expect([...handlers.keys()]).toEqual(['install', 'activate'])
  expect(skipWaiting).toHaveBeenCalledOnce()
  expect(claim).toHaveBeenCalledOnce()
  expect(unregister).toHaveBeenCalledOnce()
  expect(remove.mock.calls).toEqual([[`workbox-precache-v2-${scope}`]])
})
