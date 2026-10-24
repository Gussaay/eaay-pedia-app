// The writes behind the user manager's access controls and the Access page.
// Only the superuser and managers may make them (database.rules.json).
import { removeAt, updateAt, updatePaths } from './rtdb';
import { canAdmin, readConfig } from './access';
import { PRO_SCOPE, TRIAL_SCOPE } from './unlockRequests';

const DAY = 86_400_000;
export const daysFromNow = (days) => (days ? Date.now() + days * DAY : null);

/**
 * Sets someone's role. The older `quizusers/<uid>/admin` flag follows it, so
 * the database rules that still read that flag agree with the new role.
 */
export const setRole = (uid, role, by) =>
  updatePaths({
    [`access/${uid}/role`]: role,
    [`access/${uid}/role_by`]: by || '',
    [`access/${uid}/role_at`]: Date.now(),
    [`quizusers/${uid}/admin`]: canAdmin(role) ? 'true' : 'false',
  });

/** plan "" goes back to the app-wide default. */
export const setPlan = (uid, plan, until = null) =>
  updateAt(`access/${uid}`, { plan: plan || null, plan_until: plan && until ? until : null });

export const setProUntil = (uid, until) => updateAt(`access/${uid}`, { pro_until: until || null });

export const startTrial = (uid, days, by) =>
  updateAt(`access/${uid}`, { trial: { start: Date.now(), end: daysFromNow(days), by: by || '' } });

/** Ends a trial now but keeps the record, so they still count as "had a trial". */
export const endTrial = (uid) => updateAt(`access/${uid}/trial`, { end: Date.now() });

export const grantUnlock = (uid, key, { title = '', until = null, by = '' } = {}) =>
  updateAt(`access/${uid}/unlocks/${key}`, { at: Date.now(), by, title, until: until || null });

export const removeUnlock = (uid, key) => removeAt(`access/${uid}/unlocks/${key}`);

export const saveConfig = (values) => updateAt('access_config', readConfig(values));

/**
 * Approves a request in one write: the unlock, trial or Pro it asked for, and
 * the request's new status. `days` limits it (0 = no end); a trial with no
 * days gets the app's trial length.
 */
export function approveRequest(uid, key, req, { days = 0, by = '', config } = {}) {
  const now = Date.now();
  const updates = {
    [`unlock_requests/${uid}/${key}/status`]: 'approved',
    [`unlock_requests/${uid}/${key}/decided_at`]: now,
    [`unlock_requests/${uid}/${key}/decided_by`]: by,
  };
  if (key === TRIAL_SCOPE) {
    updates[`access/${uid}/trial`] = { start: now, end: daysFromNow(days || readConfig(config).trial_days), by };
  } else if (key === PRO_SCOPE) {
    updates[`access/${uid}/role`] = 'pro';
    updates[`access/${uid}/pro_until`] = daysFromNow(days);
  } else {
    updates[`access/${uid}/unlocks/${key}`] = { at: now, by, title: req.title || '', until: daysFromNow(days) };
  }
  return updatePaths(updates);
}

export const denyRequest = (uid, key, by = '') =>
  updatePaths({
    [`unlock_requests/${uid}/${key}/status`]: 'denied',
    [`unlock_requests/${uid}/${key}/decided_at`]: Date.now(),
    [`unlock_requests/${uid}/${key}/decided_by`]: by,
  });
