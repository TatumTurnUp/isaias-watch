// Isaias Watch service worker.
// 1) Lets phones (Android especially) show alert notifications.
// 2) Keeps a copy of the page itself so the home-screen app still opens on a weak storm-time signal.
//    Always tries the network first, so what you see is live whenever there is any connection.
//    Weather data (NWS, NHC, radar, /api) is never cached here.
const CACHE = 'iw-shell-v3';
const SHELL = ['/', '/style.css', '/mobile.css', '/watch.css', '/help.css', '/base.js', '/core.js', '/alerts.js', '/help.js', '/x.css', '/x.js', '/places.js', '/share.js', '/pwa.js', '/icon-192.png'];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/build.json') return;
  const nav = req.mode === 'navigate';
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), nav ? 8000 : 12000);
      const res = await fetch(req, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (res.ok) cache.put(nav ? '/' : url.pathname, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = await cache.match(nav ? '/' : url.pathname);
      if (hit) return hit;
      throw err;
    }
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('/');
  }));
});
