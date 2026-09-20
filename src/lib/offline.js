// Offline storage (IndexedDB): quizzes saved for offline play and results that
// were finished without a connection and still have to be sent.
//
// Two ways a quiz gets saved:
//   - automatically, whenever it is opened online (kept: AUTO_LIMIT newest)
//   - manually, with the "Download" button (never removed automatically)

const DB_NAME = 'easy-pedia-offline';
const DB_VERSION = 1;
export const STORE_QUIZZES = 'quizzes';
export const STORE_QUEUE = 'queue';
const AUTO_LIMIT = 40;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_QUIZZES)) {
        db.createObjectStore(STORE_QUIZZES, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function tx(store, mode, run) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

const all = (store) => tx(store, 'readonly', (s) => s.getAll());

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------
export const quizKey = (meta) => `${meta.kind}:${meta.pkey}`;

export async function saveQuiz(meta, questions, { manual = false } = {}) {
  const key = quizKey(meta);
  const existing = await tx(STORE_QUIZZES, 'readonly', (s) => s.get(key)).catch(() => null);
  const record = {
    key,
    kind: meta.kind,
    id: meta.id,
    pkey: meta.pkey,
    meta,
    questions,
    count: questions.length,
    savedAt: Date.now(),
    // A manual download stays manual even when refreshed automatically later.
    manual: manual || !!existing?.manual,
  };
  await tx(STORE_QUIZZES, 'readwrite', (s) => s.put(record));
  if (!record.manual) pruneAuto().catch(() => {});
  return record;
}

export const getQuiz = (meta) =>
  tx(STORE_QUIZZES, 'readonly', (s) => s.get(quizKey(meta))).catch(() => null);

export const listQuizzes = () =>
  all(STORE_QUIZZES)
    .then((rows) => rows.sort((a, b) => b.savedAt - a.savedAt))
    .catch(() => []);

export const removeQuiz = (key) => tx(STORE_QUIZZES, 'readwrite', (s) => s.delete(key));

/** Keeps only the newest automatic downloads; manual ones are never removed. */
async function pruneAuto() {
  const rows = await listQuizzes();
  const auto = rows.filter((r) => !r.manual);
  await Promise.all(auto.slice(AUTO_LIMIT).map((r) => removeQuiz(r.key)));
}

export async function clearOfflineQuizzes() {
  await tx(STORE_QUIZZES, 'readwrite', (s) => s.clear());
}

/** Rough size of the stored questions, for the downloads screen. */
export const approxSize = (rows) =>
  rows.reduce((sum, r) => sum + JSON.stringify(r.questions || '').length, 0);

// ---------------------------------------------------------------------------
// Pending results (finished offline)
// ---------------------------------------------------------------------------
export const queueResult = (payload) =>
  tx(STORE_QUEUE, 'readwrite', (s) => s.add({ ...payload, createdAt: Date.now() }));

export const listQueue = () => all(STORE_QUEUE).catch(() => []);
export const removeQueued = (id) => tx(STORE_QUEUE, 'readwrite', (s) => s.delete(id));
export const clearQueue = () => tx(STORE_QUEUE, 'readwrite', (s) => s.clear());
