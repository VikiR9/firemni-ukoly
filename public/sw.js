// Service Worker for Web Push notifications
// This file handles push events and displays notifications even when app is closed.

self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('Push event received:', event);
  
  let data = { title: 'Nový úkol', body: 'Máte nový úkol.' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.warn('Failed to parse push data:', e);
    }
  }

  const options = {
    body: data.body || data.title,
    icon: '/icon-192.png', // we'll create a simple icon later
    badge: '/badge-72.png',
    tag: 'task-notification',
    requireInteraction: false,
    data: data.url || '/',
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Firemní úkoly', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked');
  event.notification.close();
  
  const urlToOpen = event.notification.data || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If a window is already open, focus it
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});
