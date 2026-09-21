// Records a build in the database and points the app at it. Run by CI after
// the new bundle and APK are already on the server.
//
//   update/history/<version>  every build, so the Update manager can roll back
//   update/live               the one installed apps should move to
//
// A rollout the admin has paused is left paused: CI publishes the files and
// records the build, but does not override a human decision to stop shipping.
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const DATABASE_URL = 'https://easy-pedia.firebaseio.com';
const KEEP_HISTORY = 15;

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(raw)), databaseURL: DATABASE_URL });
const db = getDatabase();

const version = value('version');
const url = value('url');
if (!version || !url) {
  console.error('Both --version and --url are required.');
  process.exit(1);
}

// Database keys cannot contain a dot, and versions are full of them.
const key = version.replace(/\./g, '_');

const release = {
  version,
  versionCode: Number(value('version-code', 0)) || 0,
  url,
  checksum: value('checksum', '') || null,
  minNativeBuild: Number(value('min-native-build', 0)) || 0,
  apkUrl: value('apk-url', '') || null,
  size: value('size', '') || null,
  notes: value('notes', '') || null,
  date: new Date().toISOString().slice(0, 10),
  signed: flag('signed'),
  publishedAt: Date.now(),
};

async function main() {
  const liveSnap = await db.ref('update/live').get();
  const live = liveSnap.val() || {};
  const paused = live.paused === true || live.paused === 'true';

  const updates = { [`update/history/${key}`]: release };

  if (flag('hold')) {
    console.log(`Recorded ${version} but left it unpublished (--hold).`);
  } else if (paused) {
    console.log(`Recorded ${version}. Rollout is paused in the Update manager, so it was not published.`);
  } else {
    updates['update/live'] = {
      version: release.version,
      url: release.url,
      checksum: release.checksum,
      minNativeBuild: release.minNativeBuild,
      notes: release.notes,
      mandatory: flag('mandatory'),
      paused: false,
      publishedAt: release.publishedAt,
    };
    console.log(`${version} is now the live update${flag('mandatory') ? ' (required)' : ''}.`);
  }

  await db.ref().update(updates);

  // Keep the history readable, but never delete the build that is live.
  const historySnap = await db.ref('update/history').get();
  const all = Object.entries(historySnap.val() || {}).sort(
    (a, b) => (b[1]?.versionCode || 0) - (a[1]?.versionCode || 0),
  );
  const stale = all.slice(KEEP_HISTORY).filter(([k]) => k !== key && k !== String(live.version || '').replace(/\./g, '_'));
  if (stale.length) {
    const removals = {};
    stale.forEach(([k]) => {
      removals[`update/history/${k}`] = null;
    });
    await db.ref().update(removals);
    console.log(`Trimmed ${stale.length} old history record(s).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // The service account created by `firebase init hosting:github` can deploy
    // Hosting but is not always allowed to write the Realtime Database. Say so
    // plainly rather than failing with a bare "permission denied": the release
    // itself is fine either way, because the app falls back to the static
    // /latest/update.json when update/live is missing.
    if (/permission|PERMISSION_DENIED|Unauthorized/i.test(e?.message || '')) {
      console.error(
        '::warning::Could not write to the database. Over-the-air updates still work from ' +
          '/latest/update.json, but the Update manager will not show this build and cannot roll ' +
          'it back. To fix: Google Cloud console -> IAM -> the service account used by this ' +
          'workflow -> grant "Firebase Realtime Database Admin".',
      );
    }
    console.error(e);
    process.exit(1);
  });
