// Which app someone last opened, from their quizusers record. The old
// Sketchware app writes ver "5" (or nothing); the new app writes ver "6" plus
// `app` (e.g. "6.0.49"), `platform` ("android" or "web") and, on Android,
// `apk` (the installed shell's version).

export function appOf(u = {}) {
  const ver = parseFloat(u.ver);
  if (u.app) {
    const where = u.platform === 'web' ? 'Web' : 'Android';
    return { kind: u.platform === 'web' ? 'web' : 'android', label: `${where} ${u.app}`, short: `v${u.app}` };
  }
  if (Number.isFinite(ver) && ver >= 6) return { kind: 'new', label: 'New app (older build)', short: 'New app' };
  return { kind: 'old', label: Number.isFinite(ver) ? `Old app (v${u.ver})` : 'Old app', short: 'Old app' };
}

export const APP_FILTERS = {
  '': 'All apps',
  old: 'Old app',
  android: 'New app · Android',
  web: 'New app · Web',
  new: 'New app · older build',
};
