// Push delivery for Easy Pedia MCQs.
//
// Pushing to FCM needs the Firebase service account, and that credential must
// never ship inside the app — anyone could pull it out of an APK and notify
// every user. So whoever wants a notification sent writes a request to
// `push_outbox` in the database, and this function, which runs with the
// project's own credentials, does the sending.
//
// It used to be a GitHub Actions job on a ten-minute cron, because the free
// Firebase plan has no server that can react to a database write. On Blaze
// there is: this triggers on the write itself, so a notification queued in the
// admin panel is on its way within a second or two instead of up to a quarter
// of an hour, and nothing outside Firebase ever holds the credential.
//
// The request shape (written by src/pages/admin/AdminNotify.jsx, and by the
// deploy for a new release):
//   title, body      what the phone shows
//   url              where a tap goes
//   target           'all' | 'user' | 'level' | 'release'
//   uid              with target 'user'
//   level            with target 'level'
//   version          with target 'release' — devices already on it are skipped
//   status           'pending' to send; this function moves it on
import { onValueWritten } from 'firebase-functions/v2/database';
import { setGlobalOptions } from 'firebase-functions/v2';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';

// The database is the legacy easy-pedia.firebaseio.com instance, which lives in
// us-central1; a database trigger has to run in its region.
setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

initializeApp();

const BATCH = 500; // FCM's limit for one multicast call
const OUTBOX_KEEP_MS = 30 * 24 * 3600_000;

const db = () => getDatabase();
const readNode = async (path) => (await db().ref(path).get()).val() || {};

/**
 * Every token, with the uid and database key it lives under, so tokens that FCM
 * rejects can be deleted afterwards.
 */
async function allTokens() {
  const byUser = await readNode('push_tokens');
  const out = [];
  for (const [uid, devices] of Object.entries(byUser)) {
    for (const [key, device] of Object.entries(devices || {})) {
      if (device?.token) out.push({ uid, key, token: device.token, version: device.version });
    }
  }
  return out;
}

async function tokensFor(request) {
  const tokens = await allTokens();
  if (request.target === 'user' && request.uid) return tokens.filter((t) => t.uid === request.uid);
  if (request.target === 'release' && request.version) {
    // Devices already on this version would be told about an update they have.
    // Tokens with no version recorded are included: unknown is not up to date.
    return tokens.filter((t) => t.version !== request.version);
  }
  if (request.target === 'level' && request.level) {
    // The level lives on the user record, so those have to be read to know
    // which devices belong to that audience.
    const users = await readNode('quizusers');
    const wanted = new Set(
      Object.entries(users)
        .filter(([, u]) => u?.level === request.level)
        .map(([uid]) => uid),
    );
    return tokens.filter((t) => wanted.has(t.uid));
  }
  return tokens;
}

/** A token FCM has rejected is dead for good; leaving it makes every send slower. */
async function dropTokens(entries) {
  if (!entries.length) return;
  const updates = {};
  entries.forEach(({ uid, key }) => {
    updates[`push_tokens/${uid}/${key}`] = null;
  });
  await db().ref().update(updates);
  logger.info(`Removed ${entries.length} token(s) that are no longer valid.`);
}

async function send(targets, { title, body, url, tag }) {
  if (!targets.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const dead = [];
  // A token FCM rejects as dead is deleted below and needs no explanation. Any
  // other failure does: "2 failed" on its own gives nobody anything to act on,
  // and the usual cause — tokens minted against a different sender id — looks
  // identical to a working setup until you read the code.
  const reasons = new Map();

  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    const response = await getMessaging().sendEachForMulticast({
      tokens: slice.map((t) => t.token),
      notification: { title, body },
      // Data has to be all strings, and it is what the app reads on a tap.
      data: { url: url || '/notifications', tag: tag || 'easy-pedia' },
      android: {
        priority: 'high',
        // Must match the channel the app creates, or Android 8+ shows nothing.
        notification: { channelId: 'default', tag: tag || 'easy-pedia' },
      },
      webpush: {
        notification: { icon: '/icon-192.png', badge: '/icon-192.png' },
        fcmOptions: { link: url || '/notifications' },
      },
    });

    sent += response.successCount;
    failed += response.failureCount;

    response.responses.forEach((r, idx) => {
      if (r.success) return;
      const code = r.error?.code || 'unknown';
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        code.includes('invalid-argument')
      ) {
        dead.push(slice[idx]);
        return;
      }
      const key = `${code}: ${r.error?.message || 'no message'}`;
      reasons.set(key, (reasons.get(key) || 0) + 1);
    });
  }

  if (reasons.size) {
    for (const [reason, count] of reasons) logger.warn(`${count}x ${reason}`);
    // Almost always this: the app was built with a google-services.json from a
    // different Firebase project, so its tokens belong to another sender.
    if ([...reasons.keys()].some((r) => /sender|entity was not found|mismatch/i.test(r))) {
      logger.warn(
        'These tokens were issued by a different Firebase sender. Check that the installed app ' +
          "was built with this project's google-services.json, then have the device re-register.",
      );
    }
  }

  await dropTokens(dead);
  return { sent, failed };
}

/** Old records, cleared as we go, so the node does not grow without limit. */
async function housekeep() {
  const outbox = await readNode('push_outbox');
  const stale = Object.entries(outbox).filter(
    ([, r]) => r?.status !== 'pending' && Date.now() - (r?.sentAt || r?.createdAt || 0) > OUTBOX_KEEP_MS,
  );
  if (!stale.length) return;
  const updates = {};
  stale.forEach(([key]) => {
    updates[`push_outbox/${key}`] = null;
  });
  await db().ref().update(updates);
  logger.info(`Cleared ${stale.length} old record(s).`);
}

export const deliverPush = onValueWritten(
  {
    ref: '/push_outbox/{key}',
    memory: '256MiB',
    timeoutSeconds: 300,
    // A retry would re-send to everyone who did receive it. A request that
    // throws is marked failed below and can be queued again deliberately.
    retry: false,
  },
  async (event) => {
    const { key } = event.params;
    const request = event.data.after.val();
    if (!request) return; // deleted, or housekeeping
    if (request.status !== 'pending') return; // our own status write, or already done

    // Claiming the record before sending is what stops a second trigger — the
    // status writes below each fire this function again — from delivering the
    // same message twice.
    //
    // `current` is null on the first run of the update function, because the
    // client has no cached copy of this path yet. Aborting there (returning
    // undefined) would abort before the server value was ever seen, which is
    // exactly what happened the first time this was deployed: the claim never
    // committed and nothing was ever sent. Writing anyway is correct — the SDK
    // validates the write against the server and re-runs this function with the
    // real value if it has changed, and the event above has already told us the
    // record is pending.
    const statusRef = db().ref(`push_outbox/${key}/status`);
    const claim = await statusRef.transaction((current) => {
      if (current === null) return 'sending';
      return current === 'pending' ? 'sending' : undefined;
    });
    if (!claim.committed) {
      logger.info(`${key}: already handled (status ${claim.snapshot.val()}).`);
      return;
    }

    logger.info(`Sending "${request.title}" to ${request.target || 'all'}`);
    try {
      const targets = await tokensFor(request);
      const { sent, failed } = await send(targets, {
        title: request.title,
        body: request.body,
        url: request.url,
        // One tag for all update notices, so someone who misses three releases
        // finds one notification rather than three.
        tag: request.target === 'release' ? 'app-update' : `notif-${key}`,
      });
      await db().ref(`push_outbox/${key}`).update({
        status: 'sent',
        sentCount: sent,
        failureCount: failed,
        sentAt: Date.now(),
      });
      logger.info(`${key}: delivered to ${sent} device(s), ${failed} failed.`);
    } catch (e) {
      logger.error(`${key}: ${e.message}`);
      await db().ref(`push_outbox/${key}`).update({
        status: 'failed',
        error: String(e.message).slice(0, 300),
        sentAt: Date.now(),
      });
    }
    await housekeep().catch((e) => logger.warn(`housekeeping: ${e.message}`));
  },
);
