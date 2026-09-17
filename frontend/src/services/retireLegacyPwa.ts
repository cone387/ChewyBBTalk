/** Migration only: never register a worker for new visitors. */
export async function retireLegacyPwa(): Promise<void> {
  const scope = new URL(import.meta.env.BASE_URL, window.location.origin).href;
  const workerUrl = new URL('sw.js', scope).href;
  let ownedLegacyWorker = false;
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const legacy = registrations.filter(registration =>
      registration.scope === scope &&
      [registration.active, registration.waiting, registration.installing]
        .some(worker => worker?.scriptURL === workerUrl)
    );
    ownedLegacyWorker = legacy.length > 0;
    await Promise.all(legacy.map(registration => registration.unregister()));
  }
  if (ownedLegacyWorker && 'caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key =>
      (key.startsWith('workbox-precache-') && key.endsWith(`-${scope}`)) ||
      (key === 'api-cache' && new URL(scope).pathname === '/')
    ).map(key => caches.delete(key)));
  }
}
