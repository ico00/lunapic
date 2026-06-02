/* LunaPic Service Worker — Web Push handler */

self.addEventListener("push", (event) => {
  const d = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(d.title ?? "LunaPic", {
      body: d.body ?? "",
      tag: d.tag ?? "lunapic-alert",
      icon: self.registration.scope + "logo.png",
      badge: self.registration.scope + "logo.png",
      // Jača/duža vibracija da bude primjetna na zaključanom Androidu.
      // (iOS web-push ignorira `vibrate` i koristi sistemski zvuk notifikacije.)
      vibrate: d.urgent
        ? [400, 150, 400, 150, 400, 150, 600]
        : [300, 120, 300],
      requireInteraction: !!d.urgent,
      renotify: true,
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
