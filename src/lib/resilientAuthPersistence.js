// src/lib/resilientAuthPersistence.js (same as the IMCI app)
// Keeps the sign-in alive when the phone's IndexedDB hiccups.
//
// WHY: Firebase Auth keeps the login in IndexedDB. When the app starts it first
// checks that IndexedDB works. On Android WebView that check sometimes fails for
// a moment (storage busy right after an update or when the phone is short of
// memory). Firebase then silently switches to localStorage, finds no login
// there, and the person is on the sign-in screen without having pressed Log out
// (signed out without pressing Log out).
//
// WHAT THIS DOES:
//  1. Tries the IndexedDB check again a few times before giving up.
//  2. Writes every login change to IndexedDB AND to a second copy in
//     localStorage, and reads from that copy when IndexedDB is empty or broken.
// A real log-out removes both copies.
import { indexedDBLocalPersistence } from 'firebase/auth';

const MIRROR_PREFIX = 'ep_authmirror:';
const RETRIES = 4;
const RETRY_DELAY_MS = 300;

// What happened at start-up (for diagnosis).
export const authStorageInfo = { idbRetries: 0, idbAvailable: null, restoredFromMirror: false };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mirrorKey = (key) => MIRROR_PREFIX + key;

function mirrorGet(key) {
  try {
    const raw = localStorage.getItem(mirrorKey(key));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function mirrorSet(key, value) {
  try { localStorage.setItem(mirrorKey(key), JSON.stringify(value)); } catch { /* full or blocked */ }
}
function mirrorRemove(key) {
  try { localStorage.removeItem(mirrorKey(key)); } catch { /* blocked */ }
}
function mirrorAvailable() {
  try {
    localStorage.setItem(MIRROR_PREFIX + 'probe', '1');
    localStorage.removeItem(MIRROR_PREFIX + 'probe');
    return true;
  } catch { return false; }
}

const Base = indexedDBLocalPersistence;

export class ResilientLocalPersistence extends Base {
  async _isAvailable() {
    let ok = false;
    for (let i = 0; i < RETRIES && !ok; i += 1) {
      if (i > 0) { authStorageInfo.idbRetries = i; await wait(RETRY_DELAY_MS); }
      try { ok = await super._isAvailable(); } catch { ok = false; }
    }
    authStorageInfo.idbAvailable = ok;
    // Without IndexedDB the localStorage copy alone still keeps the login.
    return ok || mirrorAvailable();
  }

  async _get(key) {
    let value = null;
    try { value = await super._get(key); } catch { value = null; }
    if (value) return value;
    const copy = mirrorGet(key);
    if (copy) authStorageInfo.restoredFromMirror = true;
    return copy;
  }

  async _set(key, value) {
    mirrorSet(key, value);
    try { await super._set(key, value); } catch (e) {
      // The mirror holds it; only fail when that failed too.
      if (!mirrorGet(key)) throw e;
    }
  }

  async _remove(key) {
    mirrorRemove(key);
    try { await super._remove(key); } catch (e) {
      if (mirrorGet(key)) throw e;
    }
  }
}
// Firebase reads this to decide where the login lives.
ResilientLocalPersistence.type = 'LOCAL';
