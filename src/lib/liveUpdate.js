// Over-the-air ("live") updates: the app replaces its own HTML/CSS/JS without
// the user downloading a new APK.
//
// How it fits together:
//   - CI zips dist/ and publishes it next to the website, with a manifest at
//     /latest/update.json  { version, url, checksum, minNativeBuild, ... }.
//   - The admin Update manager can override that manifest through the database
//     node `update/live` (pause a rollout, pin an older version, force one).
//   - Capgo downloads the zip, we queue it with next(), and it becomes active
//     on the next launch — or immediately if the user taps "Restart now".
//
// Two rules keep this safe:
//   1. A bundle is only offered when its minNativeBuild <= the installed APK.
//      Web code that calls a plugin the installed APK does not contain would
//      crash on launch, and the user cannot get out of that without
//      reinstalling. Native changes still need a real APK, which is what
//      nativeVersion.js + the download manager handle.
//   2. notifyAppReady() must run on every launch. If it does not, Capgo
//      assumes the bundle is broken and rolls back to the previous one.
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { App as CapApp } from '@capacitor/app';
import { isNative } from './native';
import { subscribe } from './rtdb';
import { LIVE_UPDATE_URL } from '../config';

const MANIFEST_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const STARTUP_DELAY_MS = 2_500;
const MIN_GAP_BETWEEN_CHECKS_MS = 60_000;
const RESUME_RECHECK_MS = 30 * 60_000;

// ---------------------------------------------------------------------------
// Store. Module level, so the engine runs once however many components render.
// ---------------------------------------------------------------------------
let state = {
  bundleVersion: null,   // the web bundle actually running
  nativeBuild: null,     // versionCode of the installed APK
  ready: false,          // a downloaded bundle is waiting to be applied
  version: null,         // version of that waiting bundle
  notes: null,
  mandatory: false,
  dismissed: false,      // the user pressed "Later"; it still installs on relaunch
  checking: false,
  downloading: false,
  progress: 0,
  installing: false,
  upToDate: false,       // only true once a check actually confirmed it
  lastCheckedAt: null,
  error: null,
};

const listeners = new Set();
export const liveUpdateStore = {
  subscribe(l) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => state,
};

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

let pendingBundleId = null;
let checking = false;
let lastCheckAt = 0;
let started = false;
let override = null; // latest value of `update/live` from the database

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const e = new Error(`${label} timed out`);
        e.code = 'timeout';
        reject(e);
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * The manifest the app should act on.
 *
 * The static file is the source of truth for "what CI last published". The
 * database node exists so a bad release can be stopped from the admin panel
 * without waiting for another build: it can pause OTA entirely, or pin an
 * older bundle that is still on the server.
 */
async function resolveManifest() {
  if (override?.paused === true || override?.paused === 'true') return null;

  let manifest = null;
  try {
    const res = await withTimeout(
      fetch(`${LIVE_UPDATE_URL}?t=${Date.now()}`, { cache: 'no-store' }),
      MANIFEST_TIMEOUT_MS,
      'Update check',
    );
    if (res.ok) manifest = await res.json();
  } catch (e) {
    if (!override?.url) throw e;
  }

  // A pinned version in the database wins, so a rollback takes effect at once.
  if (override?.url && override?.version) {
    manifest = {
      version: String(override.version),
      url: override.url,
      checksum: override.checksum || undefined,
      notes: override.notes || manifest?.notes,
      minNativeBuild: Number(override.minNativeBuild) || manifest?.minNativeBuild || 0,
      mandatory: override.mandatory === true || override.mandatory === 'true',
    };
  } else if (manifest && override) {
    // Not pinned, but the admin may still have marked the current one required.
    if (override.mandatory === true || override.mandatory === 'true') manifest.mandatory = true;
    if (override.notes) manifest.notes = override.notes;
  }

  if (!manifest?.version || !manifest?.url) return null;
  return manifest;
}

async function readCurrent() {
  try {
    const { bundle, native } = await CapacitorUpdater.current();
    set({
      bundleVersion: bundle?.version || 'builtin',
      nativeBuild: native || state.nativeBuild,
    });
    return bundle?.version || 'builtin';
  } catch {
    return state.bundleVersion;
  }
}

/** Old bundles are never removed by Capgo itself and fill up the phone. */
async function cleanupOldBundles(keepIds = []) {
  try {
    const [{ bundles = [] }, { bundle: current }] = await Promise.all([
      CapacitorUpdater.list(),
      CapacitorUpdater.current(),
    ]);
    const keep = new Set([current?.id, ...keepIds].filter(Boolean));
    for (const b of bundles) {
      if (!keep.has(b.id) && b.status !== 'pending') {
        await CapacitorUpdater.delete({ id: b.id }).catch(() => {});
      }
    }
  } catch {
    /* housekeeping only */
  }
}

/**
 * Returns { status, ... } where status is one of:
 * 'ready' | 'up-to-date' | 'not-native' | 'busy' | 'too-soon' | 'paused'
 * | 'needs-apk' | 'offline' | 'error'
 */
export async function checkForLiveUpdate(reason, { force = false } = {}) {
  if (!isNative) return { status: 'not-native' };
  if (checking) return { status: 'busy' };
  if (state.ready) return { status: 'ready', version: state.version };
  if (!navigator.onLine) return { status: 'offline' };
  if (!force && Date.now() - lastCheckAt < MIN_GAP_BETWEEN_CHECKS_MS) return { status: 'too-soon' };

  checking = true;
  lastCheckAt = Date.now();
  set({ checking: true, error: null });

  try {
    const current = await readCurrent();
    const manifest = await resolveManifest();

    if (!manifest) {
      set({ lastCheckedAt: Date.now() });
      return { status: 'paused' };
    }

    if (manifest.version === current) {
      set({ upToDate: true, lastCheckedAt: Date.now() });
      return { status: 'up-to-date', version: current };
    }

    // Guard 1 from the file header: never install web code that expects a
    // newer APK than the one running it.
    const needs = Number(manifest.minNativeBuild) || 0;
    const installed = Number(state.nativeBuild) || 0;
    if (needs && installed && needs > installed) {
      set({ lastCheckedAt: Date.now(), upToDate: false });
      return { status: 'needs-apk', version: manifest.version };
    }

    // Re-use a bundle from an interrupted download instead of fetching again.
    const { bundles = [] } = await CapacitorUpdater.list();
    let bundle = bundles.find(
      (b) => b.version === manifest.version && (b.status === 'pending' || b.status === 'success'),
    );

    if (!bundle) {
      set({ downloading: true, progress: 0 });
      bundle = await withTimeout(
        CapacitorUpdater.download({
          url: manifest.url,
          version: manifest.version,
          checksum: manifest.checksum,
        }),
        DOWNLOAD_TIMEOUT_MS,
        'Download',
      );
    }

    // Queue it straight away: closing the app or choosing "Later" then still
    // ends with the update installed on the next launch.
    await CapacitorUpdater.next({ id: bundle.id });
    pendingBundleId = bundle.id;

    set({
      ready: true,
      version: manifest.version,
      notes: manifest.notes || null,
      mandatory: !!manifest.mandatory,
      dismissed: false,
      downloading: false,
      progress: 100,
      upToDate: false,
      lastCheckedAt: Date.now(),
      error: null,
    });

    cleanupOldBundles([bundle.id]);
    return { status: 'ready', version: manifest.version };
  } catch (e) {
    const message =
      e?.code === 'timeout'
        ? 'The connection is too slow. The update will be tried again later.'
        : e?.message || 'The update could not be downloaded.';
    set({ downloading: false, progress: 0, error: message });
    return { status: 'error', message };
  } finally {
    checking = false;
    set({ checking: false });
  }
}

/** Applies a bundle that is already on the phone, so this works offline. */
export async function installLiveUpdate() {
  if (!pendingBundleId) return;
  set({ installing: true });
  try {
    await CapacitorUpdater.set({ id: pendingBundleId });
  } catch (e) {
    set({ installing: false, error: e?.message || 'The update could not be applied.' });
  }
}

export function postponeLiveUpdate() {
  if (state.mandatory) return;
  set({ dismissed: true });
}

export function reopenLiveUpdate() {
  set({ dismissed: false });
}

/** Admin escape hatch: go back to the web build shipped inside the APK. */
export async function resetToBuiltIn() {
  await CapacitorUpdater.reset();
  pendingBundleId = null;
  set({ ready: false, version: null, dismissed: false });
}

export async function listInstalledBundles() {
  if (!isNative) return [];
  const [{ bundles = [] }, { bundle: current }] = await Promise.all([
    CapacitorUpdater.list(),
    CapacitorUpdater.current(),
  ]);
  return bundles.map((b) => ({ ...b, current: b.id === current?.id }));
}

/** Starts background checking. Safe to call many times. */
export function startLiveUpdates() {
  if (!isNative || started) return;
  started = true;

  // Guard 2 from the file header. Without this the bundle is rolled back a few
  // seconds after it starts, and the user never keeps the update.
  CapacitorUpdater.notifyAppReady().catch(() => {});

  CapApp.getInfo()
    .then((info) => set({ nativeBuild: Number(info.build) || null }))
    .catch(() => {});
  readCurrent();
  cleanupOldBundles();

  CapacitorUpdater.addListener('download', ({ percent }) => {
    if (typeof percent === 'number') set({ downloading: percent < 100, progress: percent });
  });
  CapacitorUpdater.addListener('updateFailed', () =>
    set({ error: 'The new version would not start, so the previous one was restored.' }),
  );
  CapacitorUpdater.addListener('downloadFailed', () =>
    set({ downloading: false, progress: 0 }),
  );

  // The admin override, live. onValue keeps working offline from its cache.
  subscribe('update/live', (value) => {
    override = value && typeof value === 'object' ? value : null;
  });

  setTimeout(() => checkForLiveUpdate('startup'), STARTUP_DELAY_MS);

  window.addEventListener('online', () => checkForLiveUpdate('back-online'));

  CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive && Date.now() - lastCheckAt > RESUME_RECHECK_MS) checkForLiveUpdate('resume');
  });

  // Note: do NOT call set() when the app is minimised. That reloads the WebView
  // in the background, and if Android kills the app before notifyAppReady()
  // runs, Capgo treats the bundle as broken and restores the old one.
}
