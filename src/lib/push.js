// Push notifications (FCM), one API over two transports.
//
//   native  @capacitor/push-notifications -> Android shows the notification in
//           the tray itself while the app is closed or in the background. Only
//           foreground messages reach JavaScript, which is why they are pushed
//           onto the event bus below for the UI to show.
//   web     firebase/messaging + public/firebase-messaging-sw.js for messages
//           that arrive while the tab is closed.
//
// Device tokens are stored under `push_tokens/<uid>/<key>` rather than on the
// user record, because the sender needs to read every token at once and the
// user records are large. One person can have several devices, so each token
// is its own child and carries the app version, which also gives the admin
// Update manager an honest picture of what is installed out there.
import { useEffect, useRef, useState } from 'react';
import { isNative } from './native';
import { updateAt, getOne, removeAt } from './rtdb';
import { APP_VERSION, FCM_VAPID_KEY } from '../config';

// ---------------------------------------------------------------------------
// Event bus
// ---------------------------------------------------------------------------
const listeners = new Set();
const recent = new Map();
const DEDUPE_MS = 8_000;

function alreadySeen(id) {
  if (!id) return false;
  const now = Date.now();
  for (const [k, at] of recent) if (now - at > DEDUPE_MS) recent.delete(k);
  if (recent.has(id)) return true;
  recent.set(id, now);
  return false;
}

/** Normalises a payload from either transport into one shape. */
function emit(raw, { source, tapped = false }) {
  const notification = raw?.notification || raw || {};
  const data = raw?.data || notification?.data || {};
  const id = raw?.messageId || raw?.id || data.messageId || null;

  // A tap is always worth delivering, even if the message was just shown.
  if (!tapped && alreadySeen(id)) return;

  const event = {
    id,
    title: notification.title || data.title || 'Easy Pedia MCQs',
    body: notification.body || notification.message || data.body || '',
    data,
    source,
    tapped,
    at: Date.now(),
  };
  listeners.forEach((l) => {
    try {
      l(event);
    } catch (e) {
      console.error('[push] listener failed', e);
    }
  });
}

export function subscribeToPush(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React subscription. The handler is kept in a ref, so it never needs memoising. */
export function usePushEvents(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribeToPush((e) => ref.current?.(e)), []);
}

export function useLatestPush() {
  const [latest, setLatest] = useState(null);
  usePushEvents(setLatest);
  return [latest, () => setLatest(null)];
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------
/** FCM tokens contain "." and "/", which a database key cannot. */
function tokenKey(token) {
  let h = 5381;
  for (let i = 0; i < token.length; i += 1) h = ((h << 5) + h + token.charCodeAt(i)) | 0;
  return `t${(h >>> 0).toString(36)}`;
}

async function saveToken(uid, token, platform) {
  if (!uid || !token) return;
  const cacheKey = `push:token:${uid}`;
  const key = tokenKey(token);
  const cached = localStorage.getItem(cacheKey);

  // Still re-write once a day: the sender prunes tokens that stopped being
  // refreshed, and a device that is in use should not look abandoned.
  const lastAt = Number(localStorage.getItem(`${cacheKey}:at`) || 0);
  if (cached === token && Date.now() - lastAt < 24 * 60 * 60_000) return;

  try {
    await updateAt(`push_tokens/${uid}/${key}`, {
      token,
      platform,
      version: APP_VERSION,
      updatedAt: Date.now(),
    });
    localStorage.setItem(cacheKey, token);
    localStorage.setItem(`${cacheKey}:at`, String(Date.now()));
  } catch (e) {
    console.warn('[push] could not save the token', e?.message);
  }
}

/** Called on sign-out so the next person on this phone does not get their pushes. */
export async function forgetPushToken(uid) {
  // Without this, signing back in as the same person hits the "already set up"
  // guard in registerForPush() while the token has just been deleted, and push
  // stays dead until the app is restarted.
  if (setupUid === uid) setupUid = null;
  const cacheKey = `push:token:${uid}`;
  const token = localStorage.getItem(cacheKey);
  localStorage.removeItem(cacheKey);
  localStorage.removeItem(`${cacheKey}:at`);
  if (uid && token) await removeAt(`push_tokens/${uid}/${tokenKey(token)}`).catch(() => {});
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
let setupUid = null;

async function setupNative(uid) {
  const { PushNotifications } = await import('@capacitor/push-notifications');

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') return { ok: false, reason: 'denied' };

  // Android 8+ drops heads-up notifications that name a channel it does not
  // know, so the channel has to exist before the first message arrives. The
  // sender must set android.notification.channel_id to the same id.
  await PushNotifications.createChannel({
    id: 'default',
    name: 'App notifications',
    description: 'New quizzes, announcements and app updates',
    importance: 5,
    visibility: 1,
  }).catch(() => {});

  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener('registration', (t) => saveToken(uid, t.value, 'android'));
  await PushNotifications.addListener('registrationError', (e) =>
    console.error('[push] registration failed', JSON.stringify(e)),
  );
  // Android draws nothing for a message that arrives while the app is open,
  // so this is the only path that can show it.
  await PushNotifications.addListener('pushNotificationReceived', (n) =>
    emit(n, { source: 'native' }),
  );
  await PushNotifications.addListener('pushNotificationActionPerformed', (a) =>
    emit(a?.notification, { source: 'native', tapped: true }),
  );

  await PushNotifications.register();
  return { ok: true };
}

async function setupWeb(uid, { ask }) {
  if (!FCM_VAPID_KEY) return { ok: false, reason: 'no-vapid-key' };

  const { getMessaging, getToken, onMessage, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return { ok: false, reason: 'unsupported' };
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
  if (Notification.permission !== 'granted') {
    // Browsers reject a prompt that no click started, and a refused prompt
    // cannot be asked again — so only ask when the UI says a click caused this.
    if (!ask) return { ok: false, reason: 'needs-prompt' };
    if ((await Notification.requestPermission()) !== 'granted') return { ok: false, reason: 'denied' };
  }

  const { app } = await import('../firebase');
  const messaging = getMessaging(app);
  // No serviceWorkerRegistration on purpose: Firebase then registers
  // public/firebase-messaging-sw.js under its own scope. Pointing it at the
  // PWA's service worker instead would put two workers on one scope, and the
  // PWA one has no background message handler.
  const token = await getToken(messaging, { vapidKey: FCM_VAPID_KEY });
  if (token) await saveToken(uid, token, 'web');

  const off = onMessage(messaging, (payload) => emit(payload, { source: 'web' }));
  return { ok: true, cleanup: off };
}

/**
 * Registers this device for push. Safe to call repeatedly: it only does the
 * work once per signed-in user.
 *
 * `ask` must be true when a user action triggered the call, because web
 * browsers ignore a permission prompt that did not come from a click.
 */
export async function registerForPush(uid, { ask = false } = {}) {
  if (!uid) return { ok: false, reason: 'signed-out' };
  if (setupUid === uid && !ask) return { ok: true, already: true };
  setupUid = uid;
  try {
    return isNative ? await setupNative(uid) : await setupWeb(uid, { ask });
  } catch (e) {
    setupUid = null;
    console.error('[push] setup failed', e);
    return { ok: false, reason: 'error', error: e?.message };
  }
}

/** Current permission state, for the settings toggle. */
export async function pushPermission() {
  if (isNative) {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const p = await PushNotifications.checkPermissions().catch(() => null);
    return p?.receive || 'unknown';
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // 'granted' | 'denied' | 'default'
}

/** Used by the admin Notification manager to show how many devices it can reach. */
export async function countPushTokens() {
  const all = await getOne('push_tokens');
  if (!all) return { users: 0, devices: 0, byVersion: {} };
  const byVersion = {};
  let devices = 0;
  Object.values(all).forEach((perUser) => {
    Object.values(perUser || {}).forEach((t) => {
      devices += 1;
      const v = t?.version || 'unknown';
      byVersion[v] = (byVersion[v] || 0) + 1;
    });
  });
  return { users: Object.keys(all).length, devices, byVersion };
}
