/* LunaPic Service Worker — Web Push handler */

self.addEventListener("push", (event) => {
  const d = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(d.title ?? "LunaPic", {
      body: d.body ?? "",
      tag: d.tag ?? "lunapic-alert",
      icon: self.registration.scope + "logo.png",
      badge: self.registration.scope + "logo.png",
      vibrate: d.urgent ? [200, 100, 200, 100, 200] : [150],
      requireInteraction: !!d.urgent,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        const existing = list.find((c) => c.url.startsWith(self.registration.scope));
        if (existing) {
          return existing.focus();
        }
        return clients.openWindow(self.registration.scope);
      })
  );
});
