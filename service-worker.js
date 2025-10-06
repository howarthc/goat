const CACHE = 'agile-shell-v1';
const SHELL = ['./', 'assets/app.js', 'assets/styles.css', 'manifest.webmanifest'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (SHELL.some(p => url.pathname.endsWith(p.replace('./','')))) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); return;
  }
  if (url.pathname.includes('/api/')) {
    e.respondWith(caches.open('agile-api').then(async cache => {
      const cached = await cache.match(e.request);
      const fetcher = fetch(e.request).then(resp => { cache.put(e.request, resp.clone()); return resp; }).catch(() => cached);
      return cached || fetcher;
    }));
  }
});
