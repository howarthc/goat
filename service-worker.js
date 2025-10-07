const CACHE = 'goat-shell-v0.7';
const SHELL = ['./', 'assets/app.js', 'assets/styles.css', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.includes('/api/')) return;
  if (SHELL.some(p => url.pathname.endsWith(p.replace('./','')))) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});