/* Background push for the website (the native app uses Android's own tray).
 *
 * Firebase registers this file itself, under its own scope, so it does not
 * collide with the PWA service worker that vite-plugin-pwa generates.
 *
 * It cannot import from src/: a service worker is a separate script with no
 * bundler and no access to import.meta.env, so the Firebase config is repeated
 * here. These values are public identifiers, not secrets — the database rules
 * are what protect the data.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAnt2Yl_5-nxCAeTc-DSXFGHCL1eKrkA3E',
  authDomain: 'easy-pedia.firebaseapp.com',
  databaseURL: 'https://easy-pedia.firebaseio.com',
  projectId: 'easy-pedia',
  storageBucket: 'easy-pedia.appspot.com',
  messagingSenderId: '444201218220',
  appId: '1:444201218220:android:8221b6da25e9c967022f09',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const data = payload.data || {};
  self.registration.showNotification(n.title || data.title || 'Easy Pedia MCQs', {
    body: n.body || data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Replaces an earlier notification with the same tag instead of stacking
    // three copies of "a new update is available".
    tag: data.tag || 'easy-pedia',
    data: { url: data.url || data.link || '/notifications' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/notifications';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Re-use a tab that is already open rather than opening another one.
      for (const client of windows) {
        if ('focus' in client) {
          client.navigate?.(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    }),
  );
});
