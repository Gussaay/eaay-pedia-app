// The last finished attempt of every quiz, kept so its answers can be gone
// over afterwards — straight from the result, or any time later from the quiz
// page or the performance dashboard.
//
// quizHistory.js keeps one right/wrong flag per question, merged across every
// attempt. That answers "which have I got wrong?", but not "what did I pick,
// and what should it have been?" for one particular paper. This keeps the
// paper itself: which questions it held, in order, and the option chosen on
// each (blank for one left unanswered in an exam).
//
// Like the history, it is written to localStorage first (synchronous, works
// offline) and to the database second (so a second device can review it too).
import { getOne, str, updateAt } from './rtdb';
import { encodeAttempt, decodeAttempt } from './quiz';

const LKEY = 'quizreview:v1';
const MAX_LOCAL = 40;

// ---------------------------------------------------------------- local copy
function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LKEY) || '{}');
  } catch {
    return {};
  }
}
function writeLocal(all) {
  // Newest few only: a phone that studies daily should not keep every paper.
  const kept = Object.entries(all)
    .sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0))
    .slice(0, MAX_LOCAL);
  try {
    localStorage.setItem(LKEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    /* private mode or full quota: the database copy still has it */
  }
}

// ---------------------------------------------------------------- read / write
/** Called once a session is submitted. */
export async function saveAttempt(uid, pkey, { items, title, mode, path }) {
  if (!uid || !pkey || !items?.length) return;
  const record = { at: Date.now(), title: title || '', mode: mode || 'review', path: path || '', items: encodeAttempt(items) };
  const all = readLocal();
  all[pkey] = record;
  writeLocal(all);
  await updateAt(`quizreview/${uid}/${pkey}`, { ...record, at: str(record.at) }).catch(() => {});
}

/** The newer of the device's copy and the database's, or null. */
export async function loadAttempt(uid, pkey) {
  if (!pkey) return null;
  const local = readLocal()[pkey] || null;
  let remote = null;
  try {
    remote = await getOne(`quizreview/${uid}/${pkey}`);
  } catch {
    /* offline, or rules not deployed yet */
  }
  const pick = [local, remote]
    .filter((r) => r?.items)
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0];
  if (!pick) return null;
  return { ...pick, at: Number(pick.at) || 0, items: decodeAttempt(pick.items) };
}

/** Part of "Reset statistics"; the caller removes the database copy. */
export function clearAttempts() {
  try {
    localStorage.removeItem(LKEY);
  } catch {
    /* nothing stored */
  }
}
