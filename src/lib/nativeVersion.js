// Reads native-version.json (published next to the APK by the CI workflow).
import { NATIVE_VERSION_URL } from '../config';

export async function fetchNativeVersion() {
  // Relative on the website (same origin), absolute inside the native app.
  const url =
    typeof window !== 'undefined' && window.location.origin.startsWith('http') &&
    !window.location.hostname.includes('localhost')
      ? '/native-version.json'
      : NATIVE_VERSION_URL;
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** True when the published build is newer than the installed one. */
export function isNewerBuild(published, installedBuild) {
  const remote = Number(published?.versionCode);
  const local = Number(installedBuild);
  return Number.isFinite(remote) && Number.isFinite(local) && remote > local;
}
