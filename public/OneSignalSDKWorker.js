importScripts('/pwa-worker.js');
// The historical filename is retained to update already-installed applications.
// No OneSignal code is loaded; delivery uses standard Web Push on all platforms.
importScripts('/push-worker.js');
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
