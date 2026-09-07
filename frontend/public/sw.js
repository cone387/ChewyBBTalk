/* Retirement worker for previously installed ChewyBBTalk clients.
 * Keep this URL available with no-cache headers. No fetch handler, no reload.
 */
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    const keys = await caches.keys();
    await Promise.all(keys.filter(key =>
      (key.startsWith('workbox-precache-') && key.endsWith(`-${scope}`)) ||
      (key === 'api-cache' && new URL(scope).pathname === '/')
    ).map(key => caches.delete(key)));
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
