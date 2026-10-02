/* Gadget Accessories Home — service worker for web push notifications */

// API origin is passed when registering: /sw.js?api=https://api.example.com
const API = new URL(self.location.href).searchParams.get('api') || '';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Gadget Accessories Home', body: event.data && event.data.text() };
  }
  const title = data.title || 'Gadget Accessories Home';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon,
      badge: data.badge,
      image: data.image,
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/' },
    }),
  );
});

// Focus an open tab of the site (navigating it to the link) or open a new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
    if (tab) {
      await tab.focus();
      return tab.navigate(target).catch(() => self.clients.openWindow(target));
    }
    return self.clients.openWindow(target);
  })());
});

// Browser rotated the subscription — tell the server about the new one
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const old = event.oldSubscription;
    const sub = event.newSubscription || await self.registration.pushManager.subscribe(old.options);
    await fetch(`${API}/api/push/subscribe`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub }),
    }).catch(() => {});
  })());
});
