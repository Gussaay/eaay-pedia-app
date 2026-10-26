// The numbers behind the performance dashboard, worked out from answers.
//
// A question carries three ways of saying what it is about, from broad to
// narrow (lib/questionBrowse.js, lib/topicTags.js):
//
//   chapter   the clinical system, one of CHAPTERS ("Cardiology")
//   science   the basic-science section ("Pharmacology", "Clinical"…)
//   tags      the specific topic, its main one first ("Kawasaki disease")
//
// The dashboard used to file every answer under the quiz's own "chapter",
// which is only real for the old chapter quizzes: exam papers, sets and AI
// quizzes carry "?" there as a marker, so every answer from them landed under
// "?". These read the question itself instead.
//
// Plain JavaScript with no app imports beyond pure helpers, so it can be
// unit-tested.
import { CHAPTERS, SECTIONS, chapterOf, scienceOf } from './questionBrowse.js';
import { tagsOf } from './topicTags.js';

/** A database-safe key for a readable name ('.', '#', '$', '/', '[', ']' are not allowed). */
export const safeKey = (name) =>
  String(name || '')
    .trim()
    .replace(/[.#$/[\]]/g, '_')
    .slice(0, 120) || 'Other';

/** { chapter, science, tag } of one question; tag is { slug, label } or null. */
export function topicOf(q) {
  const chapter = CHAPTERS.includes(q?.chapter) ? q.chapter : chapterOf(q);
  const science = SECTIONS.includes(q?.science) ? q.science : scienceOf(q);
  const tag = tagsOf(q)[0] || null;
  return { chapter, science, tag };
}

const bump = (map, key, name, ok) => {
  const row = (map[key] ||= { name, played: 0, correct: 0 });
  row.played += 1;
  if (ok) row.correct += 1;
};

/**
 * Answers → counts by chapter, science and main tag:
 * { chapters: { key: { name, played, correct } }, sciences: {…}, tags: {…} }.
 * `answers` is [{ q, ok }].
 */
export function tallyTopics(answers) {
  const out = { chapters: {}, sciences: {}, tags: {} };
  (answers || []).forEach(({ q, ok }) => {
    if (!q) return;
    const t = topicOf(q);
    bump(out.chapters, safeKey(t.chapter), t.chapter, ok);
    bump(out.sciences, safeKey(t.science), t.science, ok);
    if (t.tag) bump(out.tags, safeKey(t.tag.slug), t.tag.label, ok);
  });
  return out;
}

/** The local calendar day of a time, as "2026-10-26". */
export function dayKey(ms = Date.now()) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Stored { name, played, correct } rows → a list with accuracy, played > 0 only. */
export function rowsOf(map) {
  return Object.entries(map || {})
    .map(([key, v]) => ({
      key,
      name: v?.name || key,
      played: Number(v?.played) || 0,
      correct: Number(v?.correct) || 0,
    }))
    .filter((t) => t.played > 0)
    .map((t) => ({ ...t, accuracy: Math.round((t.correct / t.played) * 100) }));
}

/** The last `n` days, oldest first: [{ day, played, correct }], zeros for idle days. */
export function lastDays(days, n = 14, now = Date.now()) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const day = dayKey(now - i * 86_400_000);
    const v = days?.[day] || {};
    out.push({ day, played: Number(v.played) || 0, correct: Number(v.correct) || 0 });
  }
  return out;
}

/**
 * Days in a row with at least one answer, ending today — or yesterday, so a
 * streak is not shown as broken before today's practice has happened.
 */
export function streakOf(days, now = Date.now()) {
  const active = (i) => Number(days?.[dayKey(now - i * 86_400_000)]?.played) > 0;
  let i = active(0) ? 0 : 1;
  let n = 0;
  while (active(i)) {
    n += 1;
    i += 1;
  }
  return n;
}

/** Sums of a list of { played, correct }. */
export function totalOf(list) {
  const t = (list || []).reduce(
    (s, d) => ({ played: s.played + (Number(d.played) || 0), correct: s.correct + (Number(d.correct) || 0) }),
    { played: 0, correct: 0 },
  );
  return { ...t, accuracy: t.played ? Math.round((t.correct / t.played) * 100) : null };
}

/**
 * Specific topics worth a look: those answered at least `min` times, weakest
 * first (ties: the more answered first) and strongest first.
 */
export function rankTopics(rows, min = 3) {
  const enough = (rows || []).filter((t) => t.played >= min);
  const weak = [...enough].sort((a, b) => a.accuracy - b.accuracy || b.played - a.played);
  const strong = [...enough].sort((a, b) => b.accuracy - a.accuracy || b.played - a.played);
  return { weak, strong, enough: enough.length };
}

/** Adds two stored counter maps ({ key: { name, played, correct } }) together. */
export function addCounts(prev, add) {
  const out = {};
  Object.entries(add || {}).forEach(([key, v]) => {
    const was = prev?.[key] || {};
    out[key] = {
      name: v.name || was.name || key,
      played: (Number(was.played) || 0) + (Number(v.played) || 0),
      correct: (Number(was.correct) || 0) + (Number(v.correct) || 0),
    };
  });
  return out;
}
