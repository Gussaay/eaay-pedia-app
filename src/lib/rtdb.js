// Thin helpers over the Realtime Database.
// The Android (Sketchware) app stores every value as a string and attaches
// listeners to whole nodes. Here we read with one-shot `get()` calls and use
// server-side queries where the data allows it, but keep writing values in
// the exact same string format so the Android app keeps working side by side.
import {
  ref,
  get,
  update,
  set,
  push,
  remove,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  runTransaction,
  onValue,
} from 'firebase/database';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { isConnectionBroken, reportRequestFailure, reportRequestSuccess } from './connectivity';
import { cacheGet, cacheHas, cachePatch, cachePut, cacheSet, whereKey } from './readCache';

/** Android wrote numbers as String.valueOf((long) x). */
export const str = (n) => String(Math.trunc(Number(n) || 0));
export const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Snapshot of a list node -> array of { _key, ...value }, in push-key order. */
export function toList(snapshot) {
  const out = [];
  snapshot.forEach((child) => {
    const v = child.val();
    if (v && typeof v === 'object') out.push({ _key: child.key, ...v });
  });
  return out;
}

/**
 * Every read goes through here so the connection state is driven by what
 * actually happens to real requests, rather than by what the device claims
 * about its network. A read that works is the best possible proof of
 * internet; one that fails is the earliest warning of trouble.
 */
async function track(promise) {
  try {
    const value = await promise;
    reportRequestSuccess();
    return value;
  } catch (e) {
    reportRequestFailure();
    throw e;
  }
}

export async function getList(path) {
  const snap = await track(get(ref(db, path)));
  const list = toList(snap);
  writeCache(path, list);
  return list;
}

// Whole-node snapshots kept in memory when a node has no ".indexOn" rule
// (see database.rules.json). Cleared whenever this app writes under the node.
const nodeMemo = new Map();
const MEMO_TTL = 10 * 60 * 1000;
const topNode = (path) => path.split('/')[0];
const forget = (path) => nodeMemo.delete(topNode(path));

async function getWholeNode(path) {
  const hit = nodeMemo.get(path);
  if (hit && Date.now() - hit.at < MEMO_TTL) return hit.promise;
  const promise = get(ref(db, path)).then(toList);
  nodeMemo.set(path, { at: Date.now(), promise });
  promise.catch(() => nodeMemo.delete(path));
  return promise;
}

/**
 * Filtered read (child == value). Uses a server-side query when the database
 * rules define ".indexOn" for `child`; otherwise the SDK rejects get() with
 * "Index not defined", so we fall back to downloading the node once and
 * filtering locally — which is what the Android app always did.
 */
export async function getWhere(path, child, value) {
  try {
    const snap = await track(get(query(ref(db, path), orderByChild(child), equalTo(value))));
    return toList(snap);
  } catch (e) {
    if (!/index not defined/i.test(e?.message || '')) throw e;
    if (!getWhere.warned?.has(`${path}/${child}`)) {
      (getWhere.warned ||= new Set()).add(`${path}/${child}`);
      console.warn(`[rtdb] No index for ${path}.${child}; downloading the whole node. Deploy database.rules.json to fix.`);
    }
    const all = await getWholeNode(path);
    return all.filter((item) => item[child] === value);
  }
}

/** Newest `n` children by push key (no index needed), newest first. */
export async function getLatest(path, n) {
  const snap = await track(get(query(ref(db, path), limitToLast(n))));
  return toList(snap).reverse();
}

export async function getOne(path) {
  const snap = await track(get(ref(db, path)));
  const value = snap.exists() ? snap.val() : null;
  // Keep a saved copy current when a screen has asked for this node before.
  if (cacheHas(path)) cachePut(path, value);
  return value;
}

// ---------------------------------------------------------------------------
// Reads for screens that must still show something offline (readCache.js).
// The server's answer wins; the saved copy is used when there is no working
// connection, when the request fails, or when it is slower than `wait` ms.
// Never use these for a read whose value is then added to and written back.
// ---------------------------------------------------------------------------
const inFlight = new Map();

async function cachedRead(key, fetcher, wait) {
  const saved = await cacheGet(key);
  let net = inFlight.get(key);
  if (!net) {
    net = fetcher().then((value) => {
      cachePut(key, value);
      return value;
    });
    inFlight.set(key, net);
    net.then(
      () => inFlight.delete(key),
      () => inFlight.delete(key),
    );
  }
  if (isConnectionBroken()) {
    // Do not wait on a request that cannot get through; it still runs and
    // saves its answer if the connection turns out to be back.
    net.catch(() => {});
    if (saved === undefined) throw Object.assign(new Error('No internet and nothing saved yet.'), { offline: true });
    return saved;
  }
  if (saved === undefined) return net;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(saved), wait);
    net.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(saved);
      },
    );
  });
}

export const getOneCached = (path, { wait = 5000 } = {}) =>
  cachedRead(path, () => track(get(ref(db, path))).then((s) => (s.exists() ? s.val() : null)), wait);

export const getWhereCached = (path, child, value, { wait = 5000 } = {}) =>
  cachedRead(whereKey(path, child, value), () => getWhere(path, child, value), wait);

export const updateAt = (path, values) => {
  forget(path);
  cachePatch(path, values);
  return update(ref(db, path), values);
};
/** Replaces the whole node at `path`. */
export const setAt = (path, value) => {
  forget(path);
  cacheSet(path, value);
  return set(ref(db, path), value);
};
export const removeAt = (path) => {
  forget(path);
  cacheSet(path, null);
  return remove(ref(db, path));
};

/**
 * One atomic write across several paths: { "quizqq/-Nabc": {...}, ... }.
 * Either everything is saved or nothing is (used by the bulk import).
 */
export const updatePaths = (updates) => {
  Object.keys(updates).forEach(forget);
  Object.entries(updates).forEach(([p, v]) => cacheSet(p, v));
  return update(ref(db), updates);
};

/** Deletes many paths in one atomic write (used by the bulk admin deletes). */
export const removePaths = (paths) =>
  updatePaths(Object.fromEntries(paths.map((p) => [p, null])));
export async function pushTo(path, values) {
  forget(path);
  const r = push(ref(db, path));
  if (values) {
    cachePatch(`${path}/${r.key}`, values);
    await update(r, values);
  }
  return r.key;
}
export const newKey = (path) => push(ref(db, path)).key;

/** Atomically increments a counter that is stored as a string ("12"). */
export function incrementString(path) {
  return runTransaction(ref(db, path), (current) => str(num(current) + 1));
}

/**
 * Live value of a node. With { cache: true } the saved copy is passed first
 * (the database sends nothing at all while offline, so without it the screen
 * would wait for ever), and each live value replaces the saved copy.
 */
export function subscribe(path, cb, { cache = false } = {}) {
  let live = false;
  let closed = false;
  if (cache)
    cacheGet(path).then((saved) => {
      if (!live && !closed && saved !== undefined) cb(saved);
    });
  const off = onValue(
    ref(db, path),
    (snap) => {
      live = true;
      const value = snap.exists() ? snap.val() : null;
      if (cache) cachePut(path, value);
      cb(value);
    },
    () => {
      // Refused (rules): only report nothing when there is no saved copy.
      if (!cache || !cacheHas(path)) cb(null);
    },
  );
  return () => {
    closed = true;
    off();
  };
}

// ---------------------------------------------------------------------------
// Tiny offline cache: the last successful read of a list is kept in
// localStorage so catalog screens still render on flaky connections.
// ---------------------------------------------------------------------------
const CACHE_PREFIX = 'rtdb:';
export function readCache(path) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + path);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeCache(path, list) {
  try {
    const raw = JSON.stringify(list);
    if (raw.length < 1_500_000) localStorage.setItem(CACHE_PREFIX + path, raw);
  } catch {
    /* quota exceeded or storage blocked: ignore */
  }
}

// ---------------------------------------------------------------------------
// Storage uploads (same folders as the Android app).
// ---------------------------------------------------------------------------
export async function uploadImage(folder, file) {
  const name = `${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`;
  const r = sRef(storage, `${folder}/${name}`);
  await uploadBytes(r, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(r);
}
