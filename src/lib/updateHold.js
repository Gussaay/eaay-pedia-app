// src/lib/updateHold.js (same file as the IMCI app's src/utils/updateHold.js)
//
// Keeps the phone app from restarting itself while someone is in the middle
// of something, so they can switch to another app and come back to the same
// screen.
//
// Why this is needed: a downloaded update is queued with Capgo's next(). The
// plugin applies a queued update THE MOMENT the app goes into the background
// (installNext on appMovedToBackground), which reloads the whole page. A quiz
// or a half-filled form on screen is gone, and the user comes back to the home
// page. With releases going out most days, there is nearly always an update
// waiting, so this happened almost every time.
//
// The plugin skips that switch while a "delay condition" is set. So while a
// busy screen is open we set one (a date a few hours ahead), and we remove it
// as soon as the user is on an ordinary screen again. The update still
// installs quietly, just at the next moment nothing can be lost.
//
// The date is only a safety net: if the app is killed while held, the hold
// runs out by itself, and the first ordinary screen after a restart clears it.
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

const HOLD_MS = 6 * 60 * 60 * 1000;
// Re-arm a hold that has been on for a while, so a very long session never
// outlives its own date.
const REARM_MS = 2 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 1000;

/**
 * The plugin reads the date with Java's "yyyy-MM-dd'T'HH:mm:ss.SSS" in the
 * phone's own time zone, so it is written in local time without a zone.
 */
export function localStamp(ms) {
  const d = new Date(ms);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
  );
}

// Any open popup or form. A closed one that stays in the page (the IMCI side
// menu) sits under aria-hidden="true", and must not hold updates for ever.
const overlayOpen = () => {
  try {
    return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].some(
      (el) => !el.closest('[aria-hidden="true"]'),
    );
  } catch {
    return false;
  }
};

let isBusy = () => false;
let held = null; // true / false once the plugin has been told; null = unknown
let heldAt = 0;
let started = false;

async function setHold(hold) {
  if (hold === held && (!hold || Date.now() - heldAt < REARM_MS)) return;
  held = hold;
  heldAt = Date.now();
  try {
    if (hold) {
      await CapacitorUpdater.setMultiDelay({
        delayConditions: [{ kind: 'date', value: localStamp(Date.now() + HOLD_MS) }],
      });
    } else {
      await CapacitorUpdater.cancelDelay();
    }
  } catch {
    held = null; // try again on the next check
  }
}

/** Re-checks now. Cheap; safe to call on every screen change. */
export function syncUpdateHold() {
  if (!started) return;
  let busy = false;
  try {
    busy = !!isBusy() || overlayOpen();
  } catch {
    busy = false;
  }
  setHold(busy);
}

/**
 * @param {() => boolean} busy  true while the screen holds work that a reload
 *        would lose (a quiz, a form, unsaved text)
 */
export function startUpdateHold(busy) {
  if (!Capacitor.isNativePlatform() || started) return;
  started = true;
  if (busy) isBusy = busy;
  syncUpdateHold();
  setInterval(syncUpdateHold, CHECK_EVERY_MS);
  window.addEventListener('popstate', syncUpdateHold);
  document.addEventListener('visibilitychange', syncUpdateHold);
}
