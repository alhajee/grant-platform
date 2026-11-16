// BEAPMS service worker (UBEC260): only shows push alerts and opens them. It has no fetch handler and caches
// nothing, so pages and scripts always come from the server (see components/stale-build-reload.tsx).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  event.waitUntil((async () => {
    // A focused portal tab already chimes and shows the bell; the alert is for when nobody is looking.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some(w => w.focused && w.visibilityState === 'visible')) return;
    await self.registration.showNotification(data.title || 'BEAPMS', {
      body: data.body || 'You have a new notification',
      tag: data.tag || undefined,
      icon: '/app-icons/icon-192.png',
      badge: '/app-icons/icon-192.png',
      data: { url },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(w => new URL(w.url).origin === self.location.origin);
    if (open) { await open.focus(); return open.navigate(target).catch(() => self.clients.openWindow(target)); }
    return self.clients.openWindow(target);
  })());
});
