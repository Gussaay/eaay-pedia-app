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
export async function startDownload({ id, url, fileName, title, onDone }) {
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
  });

  let progressHandle = null;
  try {
    progressHandle = await Filesystem.addListener('progress', (p) => {
      if (p?.contentLength > 0) {
        upsert(key, {
          progress: Math.min(100, Math.round((p.bytes / p.contentLength) * 100)),
          size: humanSize(p.contentLength),
        });
      }
    }).catch(() => null);

    // Redirects matter here: the public APK link is a 302 to the GitHub
    // release, and the native HTTP client follows it.
    await Filesystem.downloadFile({
      url,
      path: name,
      directory: Directory.Cache,
      progress: true,
      recursive: true,
    });

    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    upsert(key, { status: 'done', progress: 100, uri, at: Date.now() });
    onDone?.(uri);

    const opened = await openFile(uri, name);
    return { ok: true, uri, opened };
  } catch (e) {
    upsert(key, { status: 'error', error: e?.message || 'The download failed.' });
    return { ok: false, error: e?.message || 'The download failed.' };
  } finally {
    progressHandle?.remove?.();
  }
}

async function openFile(uri, name) {
  try {
    await FileOpener.open({ filePath: uri, contentType: mimeFor(name) });
    return true;
  } catch {
    return false;
  }
}

/** Re-opens a file that was downloaded earlier (the installer, usually). */
export async function openDownload(id) {
  const item = getDownload(id);
  if (!item?.uri) return false;
  const ok = await openFile(item.uri, item.fileName);
  if (!ok) upsert(id, { error: 'No app on this phone can open this file.' });
  return ok;
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
