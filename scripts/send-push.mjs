// Sends push notifications. Run by GitHub Actions, never by the app.
//
// Pushing to FCM needs the Firebase service account, which must never be
// shipped inside an app — anyone could extract it and notify every user. So
// the admin panel only writes a request to `push_outbox`, and this script,
// holding the credential in CI, does the sending.
//
//   node scripts/send-push.mjs --outbox
//       Delivers everything queued by the Notification manager.
//
//   node scripts/send-push.mjs --release --version 6.1.23 --notes "..."
//       Tells people a new version is out. Run after a deploy.
//
// Needs FIREBASE_SERVICE_ACCOUNT in the environment (the same secret the
// Hosting deploy uses).
import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { restDb } from './rtdb-rest.mjs';

const DATABASE_URL = 'https://easy-pedia.firebaseio.com';
const BATCH = 500;                      // FCM's limit for one multicast call
const OUTBOX_KEEP_MS = 30 * 24 * 3600_000;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set.');
  process.exit(1);
}
const serviceAccount = JSON.parse(raw);
// Messaging still goes through the Admin SDK (it is plain HTTPS and fails
// fast); the database does not — see scripts/rtdb-rest.mjs for why.
initializeApp({ credential: cert(serviceAccount) });

const db = restDb(DATABASE_URL, serviceAccount);
const messaging = getMessaging();

const readNode = async (path) => (await db.get(path)) || {};

/**
 * Every token, with the uid and database key it lives under, so tokens that
 * FCM rejects can be deleted afterwards.
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
  await db.updateRoot(updates);
  console.log(`Removed ${entries.length} token(s) that are no longer valid.`);
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
    const response = await messaging.sendEachForMulticast({
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
    console.log('Failures that were not dead tokens:');
    for (const [reason, count] of reasons) console.log(`  ${count}x ${reason}`);
    // Almost always this: the app was built with a google-services.json from a
    // different Firebase project, so its tokens belong to another sender.
    if ([...reasons.keys()].some((r) => /sender|entity was not found|mismatch/i.test(r))) {
      console.log(
        '::warning::These tokens were issued by a different Firebase sender. Check that the ' +
          'installed app was built with this project\'s google-services.json, then have the ' +
          'device re-register.',
      );
    }
  }

  await dropTokens(dead);
  return { sent, failed };
}

// ---------------------------------------------------------------------------
// Mode: drain the outbox
// ---------------------------------------------------------------------------
async function runOutbox() {
  const outbox = await readNode('push_outbox');
  const pending = Object.entries(outbox).filter(([, r]) => r?.status === 'pending');

  if (!pending.length) {
    console.log('Nothing waiting to send.');
  }

  for (const [key, request] of pending) {
    console.log(`Sending "${request.title}" to ${request.target}...`);
    try {
      const targets = await tokensFor(request);
      const { sent, failed } = await send(targets, {
        title: request.title,
        body: request.body,
        url: request.url,
        tag: `notif-${key}`,
      });
      await db.update(`push_outbox/${key}`, {
        status: 'sent',
        sentCount: sent,
        failureCount: failed,
        sentAt: Date.now(),
      });
      console.log(`  delivered to ${sent} device(s), ${failed} failed.`);
    } catch (e) {
      console.error(`  failed: ${e.message}`);
      // Recorded rather than retried forever: a request that keeps throwing
      // would block the queue on every scheduled run.
      await db.update(`push_outbox/${key}`, {
        status: 'failed',
        error: String(e.message).slice(0, 300),
        sentAt: Date.now(),
      });
    }
  }

  // Housekeeping, so the node does not grow without limit.
  const stale = Object.entries(outbox).filter(
    ([, r]) => r?.status !== 'pending' && Date.now() - (r?.sentAt || r?.createdAt || 0) > OUTBOX_KEEP_MS,
  );
  if (stale.length) {
    const updates = {};
    stale.forEach(([key]) => {
      updates[`push_outbox/${key}`] = null;
    });
    await db.updateRoot(updates);
    console.log(`Cleared ${stale.length} old record(s).`);
  }
}

// ---------------------------------------------------------------------------
// Mode: announce a release
// ---------------------------------------------------------------------------
async function runRelease() {
  const version = value('version');
  if (!version) throw new Error('--release needs --version');
  const notes = value('notes') || '';
  const kind = value('kind') || 'live'; // 'live' = over the air, 'apk' = full install

  const tokens = await allTokens();
  // Devices already on this version would get a notification about an update
  // they have. Tokens with no version recorded are included: unknown is not
  // the same as up to date.
  const targets = tokens.filter((t) => t.version !== version);

  console.log(`${targets.length} of ${tokens.length} device(s) are not on ${version}.`);

  const { sent, failed } = await send(targets, {
    title: kind === 'apk' ? `Easy Pedia MCQs ${version} is out` : `Easy Pedia MCQs updated to ${version}`,
    body:
      notes ||
      (kind === 'apk'
        ? 'Open the app to install the new version.'
        : 'Open the app — the update installs itself.'),
    url: '/app-updates',
    // One tag for all update notices, so a user who misses three releases
    // finds one notification rather than three.
    tag: 'app-update',
  });
  console.log(`Delivered to ${sent} device(s), ${failed} failed.`);
}

const mode = flag('outbox') ? runOutbox : flag('release') ? runRelease : null;
if (!mode) {
  console.error('Use --outbox or --release --version <v>.');
  process.exit(1);
}

mode()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
