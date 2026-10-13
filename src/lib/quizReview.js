// Every finished attempt of every quiz, kept so its answers can be gone over
// afterwards — straight from the result, or any time later from the quiz page
// or the performance dashboard.
//
// quizHistory.js keeps one right/wrong flag per question, merged across every
// attempt. That answers "which have I got wrong?", but not "what did I pick,
// and what should it have been?" for one particular paper. This keeps the
// papers themselves: which questions each held, in order, and the option
// chosen on each (blank for one left unanswered in an exam).
//
// Like the history, each one is written to localStorage first (synchronous,
// works offline) and to the database second. The database keeps them all and
// is what a second device sees; the device keeps the newest few hundred.
import { getOne, newKey, str, updateAt } from './rtdb';
import { encodeAttempt, decodeAttempt, isCorrect } from './quiz';

const LKEY = 'quizreview:v2';
const MAX_LOCAL = 200;

// ---------------------------------------------------------------- local copy
// { [pkey]: { [attemptId]: record } }
function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LKEY) || '{}');
  } catch {
    return {};
  }
}
function writeLocal(all) {
  // Only the newest papers stay on the phone; older ones are still in the
  // database and come back from there.
  const flat = [];
  Object.entries(all).forEach(([pkey, byId]) =>
    Object.entries(byId || {}).forEach(([id, r]) => flat.push([pkey, id, r])),
  );
  flat.sort((a, b) => Number(b[2]?.at || 0) - Number(a[2]?.at || 0));
  const kept = {};
  flat.slice(0, MAX_LOCAL).forEach(([pkey, id, r]) => {
    (kept[pkey] ||= {})[id] = r;
  });
  try {
    localStorage.setItem(LKEY, JSON.stringify(kept));
  } catch {
    /* private mode or full quota: the database copy still has it */
  }
}

const toAttempt = (id, r) => ({
  id,
  at: Number(r.at) || 0,
  title: r.title || '',
  mode: r.mode === 'exam' ? 'exam' : 'review',
  path: r.path || '',
  correct: Number(r.correct) || 0,
  played: Number(r.played) || 0,
  total: Number(r.total) || 0,
  items: decodeAttempt(r.items),
});

// ---------------------------------------------------------------- read / write
/** Called once a session is submitted. `questions` are the loaded bank. */
export async function saveAttempt(uid, pkey, { items, questions, title, mode, path }) {
  if (!uid || !pkey || !items?.length) return;
  let correct = 0;
  let played = 0;
  items.forEach((it) => {
    if (!it.choice) return;
    played += 1;
    if (isCorrect(questions?.[it.pos], it.choice)) correct += 1;
  });
  const id = newKey(`quizreview/${uid}/${pkey}`);
  const record = {
    at: str(Date.now()),
    title: title || '',
    mode: mode || 'review',
    path: path || '',
    correct: str(correct),
    played: str(played),
    total: str(items.length),
    items: encodeAttempt(items),
  };
  const all = readLocal();
  (all[pkey] ||= {})[id] = record;
  writeLocal(all);
  await updateAt(`quizreview/${uid}/${pkey}/${id}`, record).catch(() => {});
}

/** Every attempt of one quiz, newest first: the device's and the database's. */
export async function loadAttempts(uid, pkey) {
  if (!pkey) return [];
  const merged = { ...(readLocal()[pkey] || {}) };
  try {
    const remote = (await getOne(`quizreview/${uid}/${pkey}`)) || {};
    Object.entries(remote).forEach(([id, r]) => {
      if (r && typeof r === 'object') merged[id] = r;
    });
  } catch {
    /* offline, or rules not deployed yet: the device's copy is enough */
  }
  return Object.entries(merged)
    .filter(([, r]) => r?.items)
    .map(([id, r]) => toAttempt(id, r))
    .sort((a, b) => b.at - a.at);
}

/** Part of "Reset statistics"; the caller removes the database copy. */
export function clearAttempts() {
  try {
    localStorage.removeItem(LKEY);
  } catch {
    /* nothing stored */
  }
}
