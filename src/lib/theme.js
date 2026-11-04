// Light / dark / system appearance. The choice is remembered on the device for
// each signed-in person (and for the sign-in page), and applied by putting
// the `dark` class on <html>; index.css holds the dark colours.
const KEY = 'ep-theme';
export const THEMES = ['light', 'dark', 'system'];

const read = (k) => {
  try {
    const v = localStorage.getItem(k);
    return THEMES.includes(v) ? v : null;
  } catch {
    return null;
  }
};

export function getThemePref(uid) {
  return (uid && read(`${KEY}:${uid}`)) || read(KEY) || 'system';
}

export function systemPrefersDark() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function applyTheme(pref) {
  const dark = pref === 'dark' || (pref !== 'light' && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  return dark;
}

export function saveThemePref(uid, pref) {
  try {
    localStorage.setItem(KEY, pref);
    if (uid) localStorage.setItem(`${KEY}:${uid}`, pref);
  } catch {
    /* private mode: the choice just lasts until the app closes */
  }
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent('ep-theme', { detail: pref }));
}

// Keeps <html> in step with the saved choice, the signed-in person and the
// phone's own setting (when the choice is "system").
export function watchSystemTheme(getPref) {
  let mq;
  try {
    mq = window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return () => {};
  }
  const on = () => {
    if (getPref() === 'system') applyTheme('system');
  };
  mq.addEventListener?.('change', on);
  return () => mq.removeEventListener?.('change', on);
}
