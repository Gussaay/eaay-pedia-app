// Your progress on each quiz, for the badges on the quiz lists ("Done · 72%",
// "26/55"). Built from two things already on the phone, so it works offline:
//   quizstats/<uid>/<pkey>    attempts, played, correct of every submitted attempt
//   quizhistory/<uid>/<pkey>  last right/wrong flag of each question answered
// No imports, so it can be tested on its own (quizProgress.test.js).

/**
 * { [pkey]: { attempts, played, correct, answered, score, ids } }
 *   attempts  submitted attempts of that quiz
 *   played / correct   totals over those attempts
 *   answered  different questions of it you have answered (any attempt, or
 *             from "Linked questions"); ids holds their keys
 *   score     your average over all attempts: correct ÷ answered, in %,
 *             or null when nothing was submitted yet
 */
export function progressByQuiz(stats, ...histories) {
  const out = {};
  const row = (pkey) =>
    (out[pkey] ||= { attempts: 0, played: 0, correct: 0, answered: 0, score: null, ids: new Set() });
  Object.entries(stats || {}).forEach(([pkey, v]) => {
    const attempts = Number(v?.attempts) || 0;
    const played = Number(v?.played) || 0;
    const correct = Number(v?.correct) || 0;
    if (!attempts && !played) return;
    Object.assign(row(pkey), { attempts, played, correct, score: scoreOf(played, correct) });
  });
  histories.forEach((byQuiz) =>
    Object.entries(byQuiz || {}).forEach(([pkey, qs]) => {
      if (!qs || typeof qs !== 'object' || !Object.keys(qs).length) return;
      const r = row(pkey);
      Object.keys(qs).forEach((k) => r.ids.add(k));
      r.answered = r.ids.size;
    }),
  );
  return out;
}

const scoreOf = (played, correct) => (played ? Math.round((correct / played) * 100) : null);

/** Several quizzes counted as one (a set and its parts): totals added, questions counted once. */
export function combineProgress(rows) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return undefined;
  const ids = new Set();
  let attempts = 0;
  let played = 0;
  let correct = 0;
  list.forEach((r) => {
    attempts += r.attempts || 0;
    played += r.played || 0;
    correct += r.correct || 0;
    (r.ids || []).forEach((k) => ids.add(k));
  });
  return { attempts, played, correct, answered: ids.size, score: scoreOf(played, correct), ids };
}

/**
 * A set (chapter, science, practice) together with its parts of 100: the set
 * id itself and every "<id>_p<n>" (lib/questionBrowse.js setId).
 */
export function setProgress(progress, id) {
  if (!progress || !id) return undefined;
  const part = new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_p\\d+$`);
  return combineProgress(Object.keys(progress).filter((k) => k === id || part.test(k)).map((k) => progress[k]));
}

/**
 * What the badge says for one quiz of `total` questions, or null for a quiz
 * not started. `done` is true once every question has been answered (or, for
 * a quiz whose size is unknown, once an attempt was submitted).
 */
export function progressLabel(p, total, { changing = false } = {}) {
  if (!p || (!p.attempts && !p.answered)) return null;
  // A set picked from your own answers ("not answered yet", "answered
  // wrongly") holds different questions after each attempt, so it is never
  // "done": only your score on it so far.
  if (changing) {
    if (!p.attempts) return null;
    const times = p.attempts === 1 ? 'Tried once' : `Tried ${p.attempts}×`;
    return { done: false, text: p.score == null ? times : `${times} · ${p.score}%`, score: p.score };
  }
  const n = Number(total) || 0;
  const answered = n ? Math.min(p.answered, n) : p.answered;
  const done = n ? answered >= n : p.attempts > 0;
  const score = p.score == null ? '' : `${p.score}%`;
  if (done) return { done: true, text: score ? `Done · ${score}` : 'Done', score: p.score };
  const count = n && answered ? `${answered}/${n}` : '';
  const text = [count, score].filter(Boolean).join(' · ') || 'Started';
  return { done: false, text, score: p.score };
}
