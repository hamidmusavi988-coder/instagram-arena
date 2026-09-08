self.addEventListener('push', (event) => {
  let data = { title: 'Loop', body: 'Your people are reaching out.', url: '/?view=notifications' };
  try { data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: '/icon.svg', badge: '/icon.svg', data: { url: data.url }, tag: 'loop-' + Date.now()
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) { if (client.url.startsWith(self.location.origin) && 'focus' in client) { client.navigate(url); return client.focus(); } }
    return self.clients.openWindow(url);
  }));
});
