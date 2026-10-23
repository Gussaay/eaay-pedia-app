// Standard topic tags on quiz questions: one fixed list of topics (a condition,
// a drug, a skill such as "Statistical tests"), so questions on the same point
// can be found together whatever their wording or source.
//
//   quizqq/<id>/tags     { "<slug>": "<Label>", … }   every tag of the question
//   quizqq/<id>/topic    "<slug>"                     its main tag
//   qtags/<slug>         { "<questionId>": true, … }  every question with that tag
//
// Written by scripts/tag-exam.mjs from data/exams/tags/*.txt. Pure, so it can
// be unit-tested and used by the scripts.

/** A database-safe id for a tag label: "Long QT syndrome" → "long-qt-syndrome". */
export const tagSlug = (label) =>
  String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The tags of a question as [{ slug, label }], its main topic first. */
export function tagsOf(question) {
  const v = question?.tags;
  if (!v || typeof v !== 'object') return [];
  const list = Object.entries(v)
    .filter(([slug, label]) => slug && label && !/[/.#$[\]]/.test(slug))
    .map(([slug, label]) => ({ slug, label: typeof label === 'string' ? label : slug }));
  const main = list.findIndex((t) => t.slug === question.topic);
  if (main > 0) list.unshift(...list.splice(main, 1));
  return list;
}

/** "Label; Label" → [{ slug, label }], dropping blanks and repeats. */
export function parseTagLine(text) {
  const seen = new Set();
  return String(text || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => ({ slug: tagSlug(label), label }))
    .filter((t) => t.slug && !seen.has(t.slug) && seen.add(t.slug));
}
