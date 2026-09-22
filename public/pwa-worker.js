// Only cache the generic offline screen. Task and client data stay off disk.
const OFFLINE_CACHE = 'limmit-offline-v2';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.addAll(['/offline.html', '/app-icon-192.png?v=2'])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('limmit-offline-') && key !== OFFLINE_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (new URL(event.request.url).pathname === '/app-icon-192.png') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/app-icon-192.png?v=2')));
    return;
  }
  if (event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match('/offline.html')) || new Response('Jste offline. Připojte se k internetu.', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
});
