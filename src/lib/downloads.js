// Download manager: fetches a file inside the app, shows progress, and hands
// it to Android to open — so a new APK installs from the update dialog instead
// of sending the user off to the browser and then the Downloads folder.
//
// APKs go to the cache directory on purpose. It is listed in
// android/app/src/main/res/xml/file_paths.xml, so FileProvider can hand the
// installer a content:// URI for it (Android 7+ refuses file:// URIs), and
// Android may reclaim the space later on its own — an installer we already
// used is not worth keeping.
//
// Installing still needs "Allow from this source" the first time. Android
// raises that screen itself when the installer opens, as long as the APK
// declares REQUEST_INSTALL_PACKAGES.
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { isNative, openUrl } from './native';

const STORE_KEY = 'downloads:v1';
const MAX_KEPT = 20;

const MIME = {
  apk: 'application/vnd.android.package-archive',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  zip: 'application/zip',
};

const mimeFor = (name = '') => MIME[name.split('.').pop()?.toLowerCase()] || '*/*';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    // A download that was running when the app was killed is not resumable.
    return list.map((d) =>
      d.status === 'downloading' ? { ...d, status: 'error', error: 'Interrupted' } : d,
    );
  } catch {
    return [];
  }
}

let items = load();
const listeners = new Set();

export const downloadStore = {
  subscribe(l) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => items,
};

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items.slice(0, MAX_KEPT)));
  } catch {
    /* storage full or blocked */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function upsert(id, patch) {
  const at = items.findIndex((d) => d.id === id);
  if (at === -1) items = [{ id, ...patch }, ...items].slice(0, MAX_KEPT);
  else items = items.map((d) => (d.id === id ? { ...d, ...patch } : d));
  persist();
  emit();
}

export const getDownload = (id) => items.find((d) => d.id === id) || null;

// ---------------------------------------------------------------------------
// Downloading
// ---------------------------------------------------------------------------
const humanSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
};

/**
 * Downloads `url` and opens it. On the web there is no file system to manage,
 * so the browser's own download is used instead.
 *
 * Returns { ok, uri } — or { ok: false, error } when the download failed. A
 * file that downloaded but could not be opened still reports ok, because the
 * file is there and the UI offers an "Open" button for it.
 */
// A download that gets no progress for this long is reported as stalled, so
// the screen never sits on "Downloading…" for ever on a dead connection.
const STALL_MS = 90 * 1000;

export async function startDownload({ id, url, fileName, title, onDone, meta, autoOpen = true }) {
  if (!url) return { ok: false, error: 'No download link' };

  if (!isNative) {
    await openUrl(url);
    return { ok: true, web: true };
  }

  const key = id || fileName || url;
  const name = fileName || url.substring(url.lastIndexOf('/') + 1) || 'download';

  const existing = getDownload(key);
  if (existing?.status === 'downloading') return { ok: true, alreadyRunning: true };

  upsert(key, {
    title: title || name,
    fileName: name,
    url,
    status: 'downloading',
    progress: 0,
    error: null,
    uri: null,
    at: Date.now(),
    ...(meta || {}),
  });

  let progressHandle = null;
  let stallTimer = null;
  let stalled = null;
  const stall = new Promise((_, reject) => {
    stalled = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(
        () => reject(new Error('The download stopped (slow or broken connection).')),
        STALL_MS,
      );
    };
  });
  stall.catch(() => {});
  try {
    stalled();
    progressHandle = await Filesystem.addListener('progress', (p) => {
      stalled();
      if (p?.contentLength > 0) {
        upsert(key, {
          progress: Math.min(100, Math.round((p.bytes / p.contentLength) * 100)),
          size: humanSize(p.contentLength),
        });
      }
    }).catch(() => null);

    // Redirects matter here: the public APK link is a 302 to the GitHub
    // release, and the native HTTP client follows it.
    const result = await Promise.race([
      Filesystem.downloadFile({
        url,
        path: name,
        directory: Directory.Cache,
        progress: true,
        recursive: true,
      }),
      stall,
    ]);
    // Some servers answer an error page with 200; an installer of a few KB is
    // never right.
    const st = await Filesystem.stat({ path: name, directory: Directory.Cache }).catch(() => null);
    if (st && Number(st.size) > 0 && Number(st.size) < 50 * 1024 && /\.apk$/i.test(name)) {
      throw new Error('The server sent an incomplete file.');
    }
    const uri = result?.path?.startsWith?.('file:')
      ? result.path
      : (await Filesystem.getUri({ path: name, directory: Directory.Cache })).uri;
    upsert(key, { status: 'done', progress: 100, uri, at: Date.now(), error: null });
    onDone?.(uri);

    if (!autoOpen) return { ok: true, uri };
    const opened = await openFile(uri, name);
    if (!opened.ok) upsert(key, { error: opened.error });
    return { ok: true, uri, opened: opened.ok };
  } catch (e) {
    upsert(key, { status: 'error', error: e?.message || 'The download failed.' });
    return { ok: false, error: e?.message || 'The download failed.' };
  } finally {
    clearTimeout(stallTimer);
    progressHandle?.remove?.();
  }
}

async function openFile(uri, name) {
  try {
    await FileOpener.open({ filePath: uri, contentType: mimeFor(name) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'No app on this phone can open this file.' };
  }
}

/** True when a finished download's file is still on the phone. Android may
 * clear the cache directory at any time. */
export async function downloadFileExists(id) {
  const item = getDownload(id);
  if (!item?.fileName) return false;
  if (!isNative) return true;
  try {
    const st = await Filesystem.stat({ path: item.fileName, directory: Directory.Cache });
    return Number(st?.size) > 0;
  } catch {
    return false;
  }
}

/**
 * Re-opens a file that was downloaded earlier (the installer, usually).
 * Returns { ok } or { ok: false, error, missing } — a missing file is marked
 * as failed so the screen offers to download it again.
 */
export async function openDownload(id) {
  const item = getDownload(id);
  if (!item?.uri || !(await downloadFileExists(id))) {
    if (item) upsert(id, { status: 'error', error: 'The downloaded file is no longer on the phone.' });
    return { ok: false, missing: true, error: 'The downloaded file is no longer on the phone.' };
  }
  const res = await openFile(item.uri, item.fileName);
  upsert(id, { error: res.ok ? null : res.error });
  return res;
}

export async function removeDownload(id) {
  const item = getDownload(id);
  if (item?.fileName && isNative) {
    await Filesystem.deleteFile({ path: item.fileName, directory: Directory.Cache }).catch(() => {});
  }
  items = items.filter((d) => d.id !== id);
  persist();
  emit();
}

export async function retryDownload(id) {
  const item = getDownload(id);
  if (!item) return { ok: false, error: 'Nothing to retry' };
  return startDownload({ id, url: item.url, fileName: item.fileName, title: item.title });
}

export function clearFinishedDownloads() {
  items.filter((d) => d.status !== 'downloading').forEach((d) => removeDownload(d.id));
}
