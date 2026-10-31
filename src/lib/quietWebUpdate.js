// src/lib/quietWebUpdate.js (same file as the IMCI app's src/utils/quietWebUpdate.js)
//
// Puts a new web release into use without interrupting anyone, the way an
// ordinary website does.
//
// The new release is already downloaded by the time this is called (see
// main.jsx); the page that is open simply keeps running the code it started
// with. The switch to the new code happens:
//   - the next time the app is opened (always), or
//   - a minute after the app goes into the background (the user switched to
//     another app or tab), if no form or popup is open. The page reloads
//     while nobody is looking and reopens on the same screen, so when the user
//     comes back they are already on the new release.
// It never happens on screen: nothing visibly refreshes, and never offline.
// If the phone freezes the app in the background before the minute is up,
// the switch simply waits for the next time the app is opened.

const AWAY_MS = 60 * 1000;

let applyFn = null;
let isBusy = () => false;
let hiddenSince = null;
let timer = null;
let listening = false;

// Any open popup or form overlay (both use a full-screen fixed layer).
const overlayOpen = () =>
  !!document.querySelector('[role="dialog"], [aria-modal="true"], .fixed.inset-0');

function tryApply(reason) {
  if (!applyFn) return;
  if (navigator.onLine === false) return;
  try {
    if (overlayOpen() || isBusy()) return;
  } catch { return; }
  const fn = applyFn;
  applyFn = null;
  console.log(`⬆️ Switching to the new version quietly (${reason}).`);
  fn();
}

function startAwayClock() {
  if (hiddenSince == null) hiddenSince = Date.now();
  clearTimeout(timer);
  const left = Math.max(0, AWAY_MS - (Date.now() - hiddenSince));
  timer = setTimeout(() => {
    if (document.visibilityState === 'hidden') tryApply('app in the background');
  }, left);
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    hiddenSince = null;
    startAwayClock();
    return;
  }
  // Back on screen: never switch now, that would be a visible refresh.
  clearTimeout(timer);
  hiddenSince = null;
}

/**
 * @param {() => void} apply   switches to the new release (usually a reload)
 * @param {{ busy?: () => boolean }} [options]  busy() returns true while the
 *        user may have unsaved work on the current page
 */
export function applyWebUpdateQuietly(apply, { busy } = {}) {
  applyFn = apply;
  if (busy) isBusy = busy;
  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  if (document.visibilityState === 'hidden') startAwayClock();
}
