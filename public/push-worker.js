// Display first, acknowledge second. No page, active login or network fetch is
// needed to display the encrypted push payload supplied by the push service.
function safePushUrl(value) {
  try {
    const url = new URL(value || '/', self.location.origin);
    if (url.origin === self.location.origin && ['/', '/ucet'].includes(url.pathname)) return url.href;
  } catch {}
  return self.location.origin + '/';
}

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch {}
    if (!payload || typeof payload !== 'object') payload = {};
    await self.registration.showNotification(
      typeof payload.title === 'string' ? payload.title : 'LIMMIT · Nové upozornění',
      {
        body: typeof payload.body === 'string' ? payload.body : 'Podrobnosti najdete v aplikaci LIMMIT.',
        icon: '/app-icon-192.png?v=2', badge: '/app-icon-192.png?v=2',
        tag: typeof payload.tag === 'string' ? payload.tag : undefined,
        data: { url: safePushUrl(payload.url) },
      }
    );
    if (payload.receipt?.id && payload.receipt?.token) {
      try {
        await fetch('/api/push/receipt', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload.receipt), signal: AbortSignal.timeout(5000),
        });
      } catch { /* Display succeeded; offline receipt reporting is best effort. */ }
    }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = safePushUrl(event.notification.data?.url);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      try {
        const navigated = await client.navigate(url);
        if (navigated) { await navigated.focus(); return; }
      } catch { /* Try another window or open the installed application. */ }
    }
    await self.clients.openWindow(url);
  })());
});
