// "Request unlock": each person asks for one quiz, chapter, book, bank, a
// free trial or Pro, under unlock_requests/<uid>/<scope>. Managers answer them
// on the Access page (pages/admin/AdminAccess.jsx); approving one writes the
// unlock into access/<uid> (lib/access.js).
import { removeAt, updateAt } from './rtdb';

export const TRIAL_SCOPE = 'trial';
export const PRO_SCOPE = 'pro';

export function requestUnlock({ user, profile }, { key, type, id = '', title = '', path = '' }) {
  return updateAt(`unlock_requests/${user.uid}/${key}`, {
    type,
    id,
    title,
    path,
    status: 'pending',
    at: Date.now(),
    name: profile?.name || '',
    email: user.email || '',
  });
}

export const cancelRequest = (uid, key) => removeAt(`unlock_requests/${uid}/${key}`);
