// Remembers where you had got to, so closing the app does not lose it.
//
// The quiz already had a "Save for later" that wrote to the database, but it
// only ran when someone deliberately tapped it on the way out. An app that is
// swiped away, killed by Android for memory, or that crashes, never gets the
// chance — and that is exactly when losing your place hurts.
//
// So this writes to localStorage instead of the database:
//   - it is synchronous, so the last write always lands before the process dies
//   - it works offline, which the database write does not
//   - it costs nothing, so it can run after every single answer
//
// The database copy stays for the deliberate "Save for later", because that
// one is worth having on the user's other devices. This is the safety net.

const KEY = 'resume:v1';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 20;

const spotId = (kind, id) => `${kind}:${id}`;

// ---------------------------------------------------------------------------
// Pure helpers, so the rules can be tested without a browser.
// ---------------------------------------------------------------------------
export const isFresh = (entry, now = Date.now()) =>
  !!entry && typeof entry.at === 'number' && now - entry.at < MAX_AGE_MS;

/**
 * Drops anything stale, then keeps the newest few. A phone that studies every
 * day should not accumulate a year of abandoned sessions in localStorage.
 */
export function trimSpots(all, now = Date.now()) {
  const fresh = Object.entries(all || {}).filter(([, entry]) => isFresh(entry, now));
  fresh.sort(byNewest);
  return Object.fromEntries(fresh.slice(0, MAX_ENTRIES));
}

/**
 * Newest first. Two places saved in the same millisecond are separated by
 * `seq`, so "most recent" is never arbitrary.
 */
const byNewest = (a, b) => b[1].at - a[1].at || (b[1].seq || 0) - (a[1].seq || 0);

/** How far through, as a sentence. Used on the Continue button. */
export function describeSpot(entry) {
  if (!entry) return '';
  const done = Number(entry.at != null ? entry.done : 0) || 0;
  const total = Number(entry.total) || 0;
  if (!total) return 'Continue where you left off';
  return `Continue from card ${Math.min(done + 1, total)} of ${total}`;
}

// ---------------------------------------------------------------------------
// Storage. `store` is injectable so the tests do not need a browser.
// ---------------------------------------------------------------------------
const browserStore = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      return {};
    }
  },
  set(all) {
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      /* private mode, or the quota is full: losing the bookmark is survivable */
    }
  },
};

let store = browserStore;
// Rises with every save, to break ties between saves in the same millisecond.
let seq = 0;
export function useStoreForTests(fake) {
  store = fake || browserStore;
}

export function saveSpot(kind, id, data) {
  if (!id) return;
  const all = store.get();
  seq += 1;
  all[spotId(kind, id)] = { ...data, at: Date.now(), seq };
  store.set(trimSpots(all));
}

export function loadSpot(kind, id) {
  if (!id) return null;
  const entry = store.get()[spotId(kind, id)];
  return isFresh(entry) ? entry : null;
}

export function clearSpot(kind, id) {
  if (!id) return;
  const all = store.get();
  delete all[spotId(kind, id)];
  store.set(all);
}

/** Every saved place, newest first, each tagged with its kind and id. */
export function listSpots() {
  const all = trimSpots(store.get());
  return Object.entries(all)
    .map(([key, entry]) => {
      const [kind, ...rest] = key.split(':');
      return { kind, id: rest.join(':'), ...entry };
    })
    .sort((a, b) => b.at - a.at || (b.seq || 0) - (a.seq || 0));
}

// ---------------------------------------------------------------------------
// The quiz that was on screen when the app last stopped.
//
// Android may close an app that sits in the background for a while (to free
// memory), and an older phone app restarts itself on an update. Either way it
// comes back on the home page and the quiz seems to have "closed". This keeps
// the address of the quiz in progress, so the app can reopen it straight away
// and the quiz picks up from its own bookmark above.
// ---------------------------------------------------------------------------
const ACTIVE_KEY = 'resume:active';
const ACTIVE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

const activeStore = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      if (value) localStorage.setItem(ACTIVE_KEY, JSON.stringify(value));
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* storage unavailable: the quiz just will not reopen by itself */
    }
  },
};
let active = activeStore;
export function useActiveStoreForTests(fake) {
  active = fake || activeStore;
}

/** Called while a quiz is being played; `path` reopens it where it was. */
export function markActive(path) {
  if (path) active.set({ path, at: Date.now() });
}

/** Called when the quiz is left on purpose (finished, saved, or exited). */
export function clearActive(path) {
  const now = active.get();
  if (!path || now?.path === path) active.set(null);
}

const REOPEN_GAP_MS = 60 * 1000;
let lastReopenAt = 0;
const reopenStore = {
  get() {
    try {
      return Number(localStorage.getItem('resume:reopenedAt')) || 0;
    } catch {
      return lastReopenAt;
    }
  },
  set(at) {
    lastReopenAt = at;
    try {
      localStorage.setItem('resume:reopenedAt', String(at));
    } catch {
      /* kept in memory instead */
    }
  },
};

/**
 * The quiz to reopen, once: reading it clears it. If the app restarted again
 * within a minute of reopening a quiz, that quiz may be what brings it down
 * (a phone very short of memory), so it is not reopened a second time.
 */
export function takeActive(now = Date.now(), reopened = reopenStore) {
  const entry = active.get();
  active.set(null);
  if (!entry?.path || typeof entry.at !== 'number' || now - entry.at > ACTIVE_MAX_AGE_MS) return null;
  if (now - reopened.get() < REOPEN_GAP_MS) return null;
  reopened.set(now);
  return entry.path;
}
