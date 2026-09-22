// Is there actually internet?
//
// The app used to ask navigator.onLine / Capacitor's Network plugin, which
// only report whether a network interface exists. A phone on Wi-Fi with no
// working connection, or with DNS failing, answers "connected" — so every
// Firebase call failed while the app cheerfully showed no warning at all and
// spun forever. That is the state this module exists to catch.
//
// Four states, because they need different words:
//
//   online       a request has actually succeeded
//   offline      no network interface at all (airplane mode, no Wi-Fi or data)
//   no-internet  connected to something, but nothing can be reached
//   checking     finding out
//
// Two things move it: a cheap probe of a file on our own site, and real
// results reported by the data layer — a Firebase read that works proves the
// internet is fine far better than any probe.
import { Network } from '@capacitor/network';
import { NATIVE_VERSION_URL } from '../config';
import { decideStatus, describe } from './connectionState.js';

export { decideStatus, describe };

const PROBE_TIMEOUT_MS = 8_000;
const MIN_GAP_MS = 4_000;          // do not probe more often than this
const RETRY_AFTER_MS = 20_000;     // re-probe while things are broken

let state = {
  status: 'online',   // assumed until something says otherwise
  checking: false,
  lastCheckedAt: null,
  confirmed: false,   // has a request ever actually succeeded?
};

const listeners = new Set();

export const connectivityStore = {
  subscribe(l) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => state,
};

export const getConnectivity = () => state;

function set(patch) {
  const next = { ...state, ...patch };
  if (
    next.status === state.status &&
    next.checking === state.checking &&
    next.confirmed === state.confirmed
  ) {
    state = next;
    return;
  }
  state = next;
  listeners.forEach((l) => l());
}

let connectionType = 'unknown';
let checking = false;
let lastCheckAt = 0;
let retryTimer = null;
let started = false;

async function hasInterface() {
  try {
    const s = await Network.getStatus();
    connectionType = s.connectionType || 'unknown';
    return s.connected;
  } catch {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }
}

/** Fetches a small file from our own site to prove something gets through. */
async function probe() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // On the website this is same-origin; inside the app it is cross-origin,
    // which is why firebase.json sets Access-Control-Allow-Origin on it.
    const url =
      typeof window !== 'undefined' && !window.location.hostname.includes('localhost')
        ? '/native-version.json'
        : NATIVE_VERSION_URL;
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => checkConnectionNow('retry'), RETRY_AFTER_MS);
}

/**
 * Checks now. `force` skips the "not too often" guard, for a Retry button.
 */
export async function checkConnectionNow(reason = 'manual', { force = false } = {}) {
  if (checking) return state.status;
  if (!force && Date.now() - lastCheckAt < MIN_GAP_MS) return state.status;

  checking = true;
  lastCheckAt = Date.now();
  set({ checking: true });

  try {
    const iface = await hasInterface();
    if (!iface) {
      set({ status: 'offline', lastCheckedAt: Date.now() });
      scheduleRetry();
      return 'offline';
    }
    const ok = await probe();
    const status = decideStatus({ hasInterface: true, probeOk: ok });
    set({ status, lastCheckedAt: Date.now(), confirmed: state.confirmed || ok });
    if (!ok) scheduleRetry();
    else clearTimeout(retryTimer);
    return status;
  } finally {
    checking = false;
    set({ checking: false });
  }
}

/**
 * Called by the data layer when a request fails. This is the signal that
 * matters most: it is a real request to the real backend, not a guess.
 */
export function reportRequestFailure() {
  if (state.status === 'offline') return;
  set({ status: 'no-internet' });
  scheduleRetry();
  // Confirm it rather than trusting one failure, which might just be one
  // unlucky request.
  checkConnectionNow('request-failed');
}

/** Called when a request succeeds: the cheapest possible proof of internet. */
export function reportRequestSuccess() {
  clearTimeout(retryTimer);
  if (state.status !== 'online' || !state.confirmed) {
    set({ status: 'online', confirmed: true, lastCheckedAt: Date.now() });
  }
}

/** Starts watching. Safe to call more than once. */
export function startConnectivityWatch() {
  if (started) return;
  started = true;

  Network.addListener('networkStatusChange', (s) => {
    connectionType = s.connectionType || 'unknown';
    if (!s.connected) {
      set({ status: 'offline' });
      scheduleRetry();
    } else {
      // The interface came back; that is not the same as internet working.
      checkConnectionNow('network-changed', { force: true });
    }
  }).catch(() => {});

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => checkConnectionNow('browser-online', { force: true }));
    window.addEventListener('offline', () => {
      set({ status: 'offline' });
      scheduleRetry();
    });
  }

  checkConnectionNow('startup', { force: true });
}

export const getConnectionType = () => connectionType;
