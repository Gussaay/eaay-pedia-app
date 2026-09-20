// Thin helpers over the Realtime Database.
// The Android (Sketchware) app stores every value as a string and attaches
// listeners to whole nodes. Here we read with one-shot `get()` calls and use
// server-side queries where the data allows it, but keep writing values in
// the exact same string format so the Android app keeps working side by side.
import {
  ref,
  get,
  update,
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

export async function getList(path) {
  const snap = await get(ref(db, path));
  const list = toList(snap);
  writeCache(path, list);
  return list;
}

// Whole-node snapshots kept in memory when a node has no ".indexOn" rule
// (see database.rules.indexes.json). Cleared whenever this app writes under the node.
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
    const snap = await get(query(ref(db, path), orderByChild(child), equalTo(value)));
    return toList(snap);
  } catch (e) {
    if (!/index not defined/i.test(e?.message || '')) throw e;
    if (!getWhere.warned?.has(`${path}/${child}`)) {
      (getWhere.warned ||= new Set()).add(`${path}/${child}`);
      console.warn(`[rtdb] No index for ${path}.${child}; downloading the whole node. Add the indexes from database.rules.indexes.json to fix.`);
    }
    const all = await getWholeNode(path);
    return all.filter((item) => item[child] === value);
  }
}

/** Newest `n` children by push key (no index needed), newest first. */
export async function getLatest(path, n) {
  const snap = await get(query(ref(db, path), limitToLast(n)));
  return toList(snap).reverse();
}

export async function getOne(path) {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : null;
}

export const updateAt = (path, values) => {
  forget(path);
  return update(ref(db, path), values);
};
export const removeAt = (path) => {
  forget(path);
  return remove(ref(db, path));
};

/**
 * One atomic write across several paths: { "quizqq/-Nabc": {...}, ... }.
 * Either everything is saved or nothing is (used by the bulk import).
 */
export const updatePaths = (updates) => {
  Object.keys(updates).forEach(forget);
  return update(ref(db), updates);
};

/** Deletes many paths in one atomic write (used by the bulk admin deletes). */
export const removePaths = (paths) =>
  updatePaths(Object.fromEntries(paths.map((p) => [p, null])));
export async function pushTo(path, values) {
  forget(path);
  const r = push(ref(db, path));
  if (values) await update(r, values);
  return r.key;
}
export const newKey = (path) => push(ref(db, path)).key;

/** Atomically increments a counter that is stored as a string ("12"). */
export function incrementString(path) {
  return runTransaction(ref(db, path), (current) => str(num(current) + 1));
}

export function subscribe(path, cb) {
  return onValue(
    ref(db, path),
    (snap) => cb(snap.exists() ? snap.val() : null),
    () => cb(null),
  );
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
