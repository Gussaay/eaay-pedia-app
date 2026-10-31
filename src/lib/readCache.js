// The last value the server gave for each node a screen shows, kept on the
// device so the app still shows your progress with no internet for days.
//
// Why this exists: the Realtime Database web SDK keeps nothing on disk. A phone
// that opens the app offline therefore had no profile, no history and no
// paused quizzes to show, and every screen fell back to zeros. Here each read
// that a screen asks for (rtdb.js: getOneCached, getWhereCached, subscribe
// with { cache: true }) is saved in IndexedDB, and every write this app makes
// is applied to the saved copies too, so they never fall behind what you did
// on this phone.
//
// Rules that keep it honest:
//   - a fresh answer from the server always wins and replaces the saved one
//   - a failed or missing answer never replaces a saved value with nothing
//   - only screens use it; reads that work out new totals to write still go to
//     the server, so a stale copy can never be written back as the truth

const DB_NAME = 'easy-pedia-cache';
const STORE = 'kv';
const WHERE = '?where:';

/** key -> value. Loaded once, in full, so writes can patch every copy. */
const memory = new Map();
let ready = null;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function load() {
  if (ready) return ready;
  ready = openDB()
    .then(
      (db) =>
        new Promise((resolve) => {
          const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
          req.onsuccess = () => {
            (req.result || []).forEach((row) => {
              if (!memory.has(row.key)) memory.set(row.key, row.value);
            });
            resolve();
          };
          req.onerror = () => resolve();
        }),
    )
    .catch(() => {});
  return ready;
}

// Writes to disk are batched: a quiz can patch the same node many times.
const dirty = new Set();
let flushTimer = null;
function persist(key) {
  dirty.add(key);
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 300);
}
function flush() {
  flushTimer = null;
  const keys = [...dirty];
  dirty.clear();
  openDB()
    .then((db) => {
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
      keys.forEach((key) => {
        if (memory.has(key)) store.put({ key, value: memory.get(key), at: Date.now() });
        else store.delete(key);
      });
    })
    .catch(() => {});
}

const clone = (v) => (v === null || v === undefined ? v : typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

/** Saved value of `key`, or undefined when nothing has been saved. */
export async function cacheGet(key) {
  await load();
  return memory.has(key) ? clone(memory.get(key)) : undefined;
}

/** True if `key` has a saved value (only meaningful after the first cacheGet). */
export const cacheHas = (key) => memory.has(key);

export async function cachePut(key, value) {
  await load();
  memory.set(key, clone(value === undefined ? null : value));
  persist(key);
}

export const whereKey = (path, child, value) => `${WHERE}${path}|${child}|${value}`;

// ---------------------------------------------------------------- patching
const parts = (path) => String(path).split('/').filter(Boolean);

/** Sets value at the relative path `rest` inside `obj`; null removes it. */
function setIn(obj, rest, value) {
  if (!rest.length) return value === undefined ? null : value;
  const root = obj && typeof obj === 'object' ? { ...obj } : {};
  let node = root;
  for (let i = 0; i < rest.length - 1; i += 1) {
    const next = node[rest[i]];
    node[rest[i]] = next && typeof next === 'object' ? { ...next } : {};
    node = node[rest[i]];
  }
  const last = rest[rest.length - 1];
  if (value === null || value === undefined) delete node[last];
  else node[last] = clone(value);
  return root;
}

function getIn(obj, rest) {
  let node = obj;
  for (const p of rest) {
    if (!node || typeof node !== 'object') return null;
    node = node[p];
  }
  return node === undefined ? null : node;
}

const startsWith = (long, short) => short.length <= long.length && short.every((p, i) => long[i] === p);

/** Applies one write (`path` set to `value`, null = removed) to every saved copy. */
function applySet(path, value) {
  const target = parts(path);
  memory.forEach((saved, key) => {
    if (key.startsWith(WHERE)) {
      const [node, child, match] = key.slice(WHERE.length).split('|');
      const base = parts(node);
      if (target.length <= base.length || !startsWith(target, base)) return;
      const [id, ...rest] = target.slice(base.length);
      const list = Array.isArray(saved) ? saved : [];
      const i = list.findIndex((row) => row?._key === id);
      const next = [...list];
      if (i < 0) {
        // A new row joins the list when it matches the filter.
        const row = rest.length ? setIn({}, rest, value) : value;
        if (row && typeof row === 'object' && String(row[child]) === match) {
          next.push({ ...clone(row), _key: id });
          memory.set(key, next);
          persist(key);
        }
        return;
      }
      const row = rest.length ? setIn(list[i], rest, value) : value;
      if (row && typeof row === 'object') next[i] = { ...row, _key: id };
      else next.splice(i, 1);
      memory.set(key, next);
      persist(key);
      return;
    }
    const k = parts(key);
    if (startsWith(target, k)) memory.set(key, setIn(saved, target.slice(k.length), value));
    else if (startsWith(k, target)) memory.set(key, clone(getIn(value, k.slice(target.length))));
    else return;
    persist(key);
  });
}

/** Mirrors an update(path, values) on the saved copies. */
export function cachePatch(path, values) {
  const entries = Object.entries(values || {});
  // Twice: the field that puts a new row into a filtered list can come after
  // the others, which the first pass then skipped. Setting a value twice is
  // harmless.
  load().then(() => [1, 2].forEach(() => entries.forEach(([k, v]) => applySet(`${path}/${k}`, v))));
}

/** Mirrors a set(path, value) / remove(path) on the saved copies. */
export function cacheSet(path, value) {
  load().then(() => applySet(path, value));
}

/** Forgets everything (sign-out). */
export async function cacheClear() {
  await load();
  memory.clear();
  dirty.clear();
  await openDB()
    .then((db) => db.transaction(STORE, 'readwrite').objectStore(STORE).clear())
    .catch(() => {});
}

// For tests.
export const _internal = { applySet, memory, setIn };
