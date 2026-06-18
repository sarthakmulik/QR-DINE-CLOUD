// QR Dine Cloud — Staff Push Notification Service Worker
// Handles push events and shows native OS notifications to staff

self.addEventListener('push', function (event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'QR Dine Cloud', body: event.data.text() };
  }

  const title = payload.title || 'QR Dine Cloud';
  const options = {
    body: payload.body || 'New notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: payload.tag || 'dine-notification',
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: { url: payload.url || '/staff' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// When notification is clicked, open the staff portal
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/staff';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url.includes('/staff') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
