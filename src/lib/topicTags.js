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

// ---------------------------------------------------------------------------
// Automatic tagging from the topic list (data/exams/tags/topics.txt):
//   "Label", "Label = alias | alias" (aliases split on " | "), "Label !" (hand
//   tagging only) or "… ~" (a broad topic, main only when nothing else fits).
// An alias in capitals only (an acronym such as "ALL" or "TB") must match its
// case; everything else matches in any case. All match whole words.
// ---------------------------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The topic list as [{ label, slug, re, manual, broad }]. */
export function parseTopics(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const broad = /\s~$/.test(line);
    const manual = /\s!$/.test(line);
    const [label, aliasText = ''] = line.replace(/\s[!~]$/, '').split(/\s+=\s+/);
    const base = label.replace(/\s*\(.*\)\s*/g, ' ').trim();
    const parts = [escapeRe(base).replace(/[\s-]+/g, '[\\s-]+') + 's?'];
    const exact = [];
    for (const a of aliasText.split(' | ').map((s) => s.trim()).filter(Boolean)) {
      (/[a-z]/.test(a.replace(/\\[a-z]/g, '')) ? parts : exact).push(a);
    }
    const wrap = (list, flags) => (list.length ? new RegExp(`(?<![\\w])(?:${list.join('|')})(?![\\w])`, flags) : null);
    out.push({ label: label.trim(), slug: tagSlug(label), manual, broad, re: [wrap(parts, 'gi'), wrap(exact, 'g')].filter(Boolean) });
  }
  return out;
}

/** Matches of each topic in a text: Map(slug → count). */
export function topicHits(text, topics) {
  const hits = new Map();
  const t = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  for (const tp of topics) {
    if (tp.manual) continue;
    let n = 0;
    for (const re of tp.re) n += (t.match(re) || []).length;
    if (n) hits.set(tp.slug, n);
  }
  return hits;
}

/**
 * Up to `max` tags for a question, the main topic first. A topic named in the
 * correct answer counts more than one in the stem, except in "NOT / EXCEPT"
 * questions where the answer is the odd one out; `weight` (slug → number,
 * usually the topic's rarity) favours specific topics over broad ones.
 */
export function autoTags(question, topics, weight = new Map(), { max = 3, keep = 0.35 } = {}) {
  const stem = topicHits(question?.question, topics);
  const answer = topicHits(question?.[String(question?.answer || '').trim().toLowerCase()], topics);
  const score = new Map();
  for (const [slug, n] of stem) score.set(slug, n);
  const odd = /\b(NOT|EXCEPT|LEAST|INCORRECT|WRONG|FALSE)\b/.test(String(question?.question || ''));
  for (const [slug, n] of answer) score.set(slug, (score.get(slug) || 0) + (odd ? 0.5 : 1.5) * n);
  const bySlug = new Map(topics.map((t) => [t.slug, t]));
  const ranked = [...score]
    .map(([slug, s]) => ({ slug, score: s * (weight.get(slug) ?? 1) * (bySlug.get(slug).broad ? 0.4 : 1) }))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return [];
  const top = ranked[0].score;
  return ranked
    .filter((r) => r.score >= top * keep)
    .slice(0, max)
    .map((r) => ({ slug: r.slug, label: bySlug.get(r.slug).label, score: r.score }));
}
