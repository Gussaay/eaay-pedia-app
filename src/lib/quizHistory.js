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
import { getOne, removeAt, setAt, str, updateAt } from './rtdb';
import { addCounts, dayKey, rowsOf, tallyTopics } from './performance';
import { clearAttempts } from './quizReview';

const LKEY = 'quizhistory:v1';

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

/**
 * Your last outcome on every question you have answered, in any quiz or set:
 * { [question._key]: 1 | 0 }. A question answered in two quizzes counts as
 * right if it was right in either (used for "not answered yet" and "answered
 * wrongly" practice sets).
 */
export async function loadAllHistory(uid) {
  const merge = (out, byQuiz) =>
    Object.values(byQuiz || {}).forEach((qs) =>
      Object.entries(qs || {}).forEach(([k, v]) => {
        out[k] = Math.max(out[k] ?? 0, Number(v) ? 1 : 0);
      }),
    );
  const out = {};
  try {
    merge(out, (await getOne(`quizhistory/${uid}`)) || {});
  } catch {
    /* offline: the local copy is enough */
  }
  merge(out, readLocal());
  return out;
}

/** Everything needed by the performance dashboard, in one go. */
export async function loadDashboard(uid) {
  let [stats, cats, perf] = await Promise.all([
    getOne(`quizstats/${uid}`).catch(() => null),
    getOne(`quizcats/${uid}`).catch(() => null),
    getOne(`quizperf/${uid}`).catch(() => null),
  ]);
  // Counts written before the topics came from the questions themselves (most
  // of them filed under "?") are worked out again once, from your answers.
  if (perf?.v !== PERF_VERSION) {
    const rebuilt = await rebuildBreakdown(uid).catch(() => null);
    if (rebuilt) ({ cats, perf } = rebuilt);
  }
  const history = await loadAllHistory(uid);
  const outcomes = Object.values(history);
  const quizzes = Object.entries(stats || {})
    .map(([pkey, v]) => ({
      pkey,
      title: v?.title || 'Untitled quiz',
      source: v?.source || '',
      review: v?.review || '',
      attempts: Number(v?.attempts) || 0,
      played: Number(v?.played) || 0,
      correct: Number(v?.correct) || 0,
      best: Number(v?.best) || 0,
      last: Number(v?.last) || 0,
      at: Number(v?.at) || 0,
    }))
    .sort((a, b) => b.at - a.at);
  return {
    quizzes,
    topics: rowsOf(cats).filter((t) => t.name !== '?'),
    sciences: rowsOf(perf?.sciences),
    tags: rowsOf(perf?.tags),
    days: perf?.days || {},
    linked: { played: Number(perf?.linked?.played) || 0, correct: Number(perf?.linked?.correct) || 0 },
    distinct: outcomes.length,
    toRevisit: outcomes.filter((v) => !v).length,
  };
}

// ---------------------------------------------------------------- writing
// quizcats/<uid>/<chapter>       { name, played, correct }   by clinical system
// quizperf/<uid>/sciences/<key>  the same, by basic-science section
// quizperf/<uid>/tags/<slug>     the same, by specific topic (main tag)
// quizperf/<uid>/days/<yyyy-mm-dd> { played, correct }
// quizperf/<uid>/linked          { played, correct }        answered from "Linked questions"
// quizperf/<uid>/v               PERF_VERSION once the counts above are built this way
const PERF_VERSION = '2';

const asStrings = (map) =>
  Object.fromEntries(
    Object.entries(map).map(([k, v]) => [k, { name: v.name, played: str(v.played), correct: str(v.correct) }]),
  );

/** Adds answers ([{ q, ok }]) to the topic, section and day counts. */
async function bumpBreakdown(uid, answers) {
  const list = (answers || []).filter((a) => a?.q);
  if (!list.length) return;
  const [prevCats, prevPerf] = await Promise.all([getOne(`quizcats/${uid}`), getOne(`quizperf/${uid}`)]);
  const t = tallyTopics(list);
  const correct = list.filter((a) => a.ok).length;
  const day = dayKey();
  const was = prevPerf?.days?.[day] || {};
  const updates = {};
  Object.entries(asStrings(addCounts(prevCats, t.chapters))).forEach(([k, v]) => {
    updates[k] = v;
  });
  const perf = {};
  Object.entries(asStrings(addCounts(prevPerf?.sciences, t.sciences))).forEach(([k, v]) => {
    perf[`sciences/${k}`] = v;
  });
  Object.entries(asStrings(addCounts(prevPerf?.tags, t.tags))).forEach(([k, v]) => {
    perf[`tags/${k}`] = v;
  });
  perf[`days/${day}`] = {
    played: str((Number(was.played) || 0) + list.length),
    correct: str((Number(was.correct) || 0) + correct),
  };
  await Promise.all([
    Object.keys(updates).length ? updateAt(`quizcats/${uid}`, updates) : null,
    updateAt(`quizperf/${uid}`, perf),
  ]);
}

/**
 * Called once when a session is submitted. `outcomes` is keyed by question key
 * and `answers` lists every answered question as { q, ok }.
 *
 * The three writes are independent on purpose: a rejected write on one node
 * (say the rules have not been deployed yet) must not cost the reader the
 * other two.
 */
export async function recordSession({ uid, pkey, title, source, review, outcomes, answers, played, correct, percentage }) {
  if (!uid || !pkey) return;
  await Promise.all([
    saveOutcomes(uid, pkey, outcomes),
    bumpQuizStats({ uid, pkey, title, source, review, played, correct, percentage }).catch(() => {}),
    bumpBreakdown(uid, answers).catch(() => {}),
  ]);
}

/** One right/wrong flag per question, on the device and in the database. */
function saveOutcomes(uid, pkey, outcomes) {
  if (!outcomes || !Object.keys(outcomes).length) return null;
  const all = readLocal();
  all[pkey] = { ...(all[pkey] || {}), ...outcomes };
  writeLocal(all);
  return updateAt(
    `quizhistory/${uid}/${pkey}`,
    Object.fromEntries(Object.entries(outcomes).map(([k, v]) => [k, v ? '1' : '0'])),
  ).catch(() => {});
}

/**
 * Answers given in the "Linked questions" list under an explanation. They
 * count like any other: in the overall score, the topic counts, the activity
 * and each question's own right/wrong flag (filed under the quiz the question
 * belongs to, so "answered wrongly" in that quiz offers it too). They are not
 * a quiz attempt, so the quiz list and the leaderboard are left alone.
 */
export async function recordLinkedAnswers(uid, answers) {
  const list = (answers || []).filter((a) => a?.q?._key);
  if (!uid || !list.length) return;
  const byQuiz = {};
  list.forEach(({ q, ok }) => {
    (byQuiz[q.key || 'linked'] ||= {})[q._key] = ok ? 1 : 0;
  });
  Object.entries(byQuiz).forEach(([pkey, outcomes]) => saveOutcomes(uid, pkey, outcomes));
  const correct = list.filter((a) => a.ok).length;
  const totals = async () => {
    const [u, perf] = await Promise.all([getOne(`quizusers/${uid}`), getOne(`quizperf/${uid}/linked`)]);
    const totalPlay = (Number(u?.total_play) || 0) + list.length;
    const totalCorrect = (Number(u?.total_correct) || 0) + correct;
    await Promise.all([
      updateAt(`quizusers/${uid}`, {
        total_play: str(totalPlay),
        total_correct: str(totalCorrect),
        over_all: str((totalCorrect / totalPlay) * 100),
      }),
      updateAt(`quizperf/${uid}/linked`, {
        played: str((Number(perf?.played) || 0) + list.length),
        correct: str((Number(perf?.correct) || 0) + correct),
      }),
    ]);
  };
  await Promise.all([totals().catch(() => {}), bumpBreakdown(uid, list).catch(() => {})]);
}

async function bumpQuizStats({ uid, pkey, title, source, review, played, correct, percentage }) {
  const prev = (await getOne(`quizstats/${uid}/${pkey}`)) || {};
  await updateAt(`quizstats/${uid}/${pkey}`, {
    title: title || prev.title || '',
    source: source || prev.source || '',
    review: review || prev.review || '',
    attempts: str((Number(prev.attempts) || 0) + 1),
    played: str((Number(prev.played) || 0) + played),
    correct: str((Number(prev.correct) || 0) + correct),
    best: str(Math.max(Number(prev.best) || 0, percentage)),
    last: str(percentage),
    at: str(Date.now()),
  });
}

/**
 * Builds the topic, section and day counts again from what is stored: each
 * question you have answered (its last outcome, read with its tags) and each
 * finished paper (its day). Repeat attempts of one question count once here,
 * because the history keeps only the last outcome of each.
 */
async function rebuildBreakdown(uid) {
  const [history, papers, perf] = await Promise.all([
    loadAllHistory(uid),
    getOne(`quizreview/${uid}`).catch(() => null),
    getOne(`quizperf/${uid}`).catch(() => null),
  ]);
  const ids = Object.keys(history);
  const answers = [];
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60);
    const rows = await Promise.all(chunk.map((id) => getOne(`quizqq/${id}`).catch(() => null)));
    rows.forEach((q, n) => {
      if (q && typeof q === 'object') answers.push({ q, ok: !!history[chunk[n]] });
    });
  }
  // Nothing could be read (offline, say): keep the old counts rather than wipe them.
  if (ids.length && !answers.length) throw new Error('questions unavailable');
  const t = tallyTopics(answers);
  const days = {};
  Object.values(papers || {}).forEach((byId) =>
    Object.values(byId || {}).forEach((r) => {
      const at = Number(r?.at);
      if (!at) return;
      const d = (days[dayKey(at)] ||= { played: 0, correct: 0 });
      d.played += Number(r.played) || 0;
      d.correct += Number(r.correct) || 0;
    }),
  );
  const cats = asStrings(t.chapters);
  const next = {
    v: PERF_VERSION,
    sciences: asStrings(t.sciences),
    tags: asStrings(t.tags),
    days: Object.fromEntries(
      Object.entries(days).map(([k, v]) => [k, { played: str(v.played), correct: str(v.correct) }]),
    ),
    linked: perf?.linked || { played: '0', correct: '0' },
  };
  // Written whole, so the old "?" rows go.
  await Promise.all([setAt(`quizcats/${uid}`, cats), setAt(`quizperf/${uid}`, next)]);
  return { cats, perf: next };
}

/** "Reset statistics": the dashboard and the per-question history both go. */
export async function resetHistory(uid) {
  writeLocal({});
  clearAttempts();
  await Promise.all([
    removeAt(`quizhistory/${uid}`).catch(() => {}),
    removeAt(`quizstats/${uid}`).catch(() => {}),
    removeAt(`quizcats/${uid}`).catch(() => {}),
    removeAt(`quizperf/${uid}`).catch(() => {}),
    removeAt(`quizreview/${uid}`).catch(() => {}),
  ]);
}
