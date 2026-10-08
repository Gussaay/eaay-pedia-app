// What you answered, question by question, and the numbers behind the
// performance dashboard.
//
// The app already stored an average percentage per quiz, which is enough for a
// leaderboard but not enough to answer the two questions a reader actually
// asks: "which ones have I not done yet?" and "which ones did I get wrong?".
// Those need one flag per question, so that is what this keeps.
//
// Every write goes to localStorage first and to the database second:
//   - localStorage is synchronous and works offline, so the filters on the
//     setup screen are correct even on a phone that has never had a signal
//   - the database copy is what makes the same progress appear on a second
//     device, and it is allowed to fail without the session being lost
import { getOne, removeAt, str, updateAt } from './rtdb';

const LKEY = 'quizhistory:v1';

// Category names come from the question bank and may contain characters that a
// database key cannot ('.', '#', '$', '/', '[', ']'). The readable name is
// stored inside the record instead.
export const catKey = (name) =>
  String(name || '')
    .trim()
    .replace(/[.#$/[\]]/g, '_')
    .slice(0, 120) || 'Uncategorised';

// ---------------------------------------------------------------- local copy
function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LKEY) || '{}');
  } catch {
    return {};
  }
}
function writeLocal(all) {
  try {
    localStorage.setItem(LKEY, JSON.stringify(all));
  } catch {
    /* private mode or full quota: the database copy still has it */
  }
}

// ---------------------------------------------------------------- reading
/**
 * The last outcome of every question of one quiz: { [question._key]: 1 | 0 }.
 * The device's own copy wins on a tie, because it is the one that was written
 * by the session that just finished.
 */
export async function loadHistory(uid, pkey) {
  if (!pkey) return {};
  const local = readLocal()[pkey] || {};
  let remote = {};
  try {
    remote = (await getOne(`quizhistory/${uid}/${pkey}`)) || {};
  } catch {
    /* offline, or rules not deployed yet: the local copy is enough */
  }
  const out = {};
  Object.entries(remote).forEach(([k, v]) => {
    out[k] = Number(v) ? 1 : 0;
  });
  Object.entries(local).forEach(([k, v]) => {
    out[k] = Number(v) ? 1 : 0;
  });
  return out;
}

/** Everything needed by the performance dashboard, in one go. */
export async function loadDashboard(uid) {
  const [stats, cats] = await Promise.all([
    getOne(`quizstats/${uid}`).catch(() => null),
    getOne(`quizcats/${uid}`).catch(() => null),
  ]);
  const quizzes = Object.entries(stats || {})
    .map(([pkey, v]) => ({
      pkey,
      title: v?.title || 'Untitled quiz',
      source: v?.source || '',
      attempts: Number(v?.attempts) || 0,
      played: Number(v?.played) || 0,
      correct: Number(v?.correct) || 0,
      best: Number(v?.best) || 0,
      last: Number(v?.last) || 0,
      at: Number(v?.at) || 0,
    }))
    .sort((a, b) => b.at - a.at);
  const topics = Object.entries(cats || {})
    .map(([key, v]) => ({
      key,
      name: v?.name || key,
      played: Number(v?.played) || 0,
      correct: Number(v?.correct) || 0,
    }))
    .filter((t) => t.played > 0)
    .map((t) => ({ ...t, accuracy: Math.round((t.correct / t.played) * 100) }));
  return { quizzes, topics };
}

// ---------------------------------------------------------------- writing
/**
 * Called once when a session is submitted. `outcomes` is keyed by question key
 * and `categories` by readable category name.
 *
 * The three writes are independent on purpose: a rejected write on one node
 * (say the rules have not been deployed yet) must not cost the reader the
 * other two.
 */
export async function recordSession({ uid, pkey, title, source, outcomes, categories, played, correct, percentage }) {
  if (!uid || !pkey) return;
  if (outcomes && Object.keys(outcomes).length) {
    const all = readLocal();
    all[pkey] = { ...(all[pkey] || {}), ...outcomes };
    writeLocal(all);
  }
  await Promise.all([
    outcomes && Object.keys(outcomes).length
      ? updateAt(
          `quizhistory/${uid}/${pkey}`,
          Object.fromEntries(Object.entries(outcomes).map(([k, v]) => [k, v ? '1' : '0'])),
        ).catch(() => {})
      : null,
    bumpQuizStats({ uid, pkey, title, source, played, correct, percentage }).catch(() => {}),
    bumpCategories(uid, categories).catch(() => {}),
  ]);
}

async function bumpQuizStats({ uid, pkey, title, source, played, correct, percentage }) {
  const prev = (await getOne(`quizstats/${uid}/${pkey}`)) || {};
  await updateAt(`quizstats/${uid}/${pkey}`, {
    title: title || prev.title || '',
    source: source || prev.source || '',
    attempts: str((Number(prev.attempts) || 0) + 1),
    played: str((Number(prev.played) || 0) + played),
    correct: str((Number(prev.correct) || 0) + correct),
    best: str(Math.max(Number(prev.best) || 0, percentage)),
    last: str(percentage),
    at: str(Date.now()),
  });
}

async function bumpCategories(uid, categories) {
  const entries = Object.entries(categories || {}).filter(([, v]) => v?.played);
  if (!entries.length) return;
  const prev = (await getOne(`quizcats/${uid}`)) || {};
  const updates = {};
  entries.forEach(([name, v]) => {
    const key = catKey(name);
    const was = prev[key] || {};
    updates[`${key}/name`] = name;
    updates[`${key}/played`] = str((Number(was.played) || 0) + v.played);
    updates[`${key}/correct`] = str((Number(was.correct) || 0) + v.correct);
  });
  await updateAt(`quizcats/${uid}`, updates);
}

/** "Reset statistics": the dashboard and the per-question history both go. */
export async function resetHistory(uid) {
  writeLocal({});
  await Promise.all([
    removeAt(`quizhistory/${uid}`).catch(() => {}),
    removeAt(`quizstats/${uid}`).catch(() => {}),
    removeAt(`quizcats/${uid}`).catch(() => {}),
  ]);
}
