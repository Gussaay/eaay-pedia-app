// Two study aids stored on a quiz question (written offline by
// .tmp/link/similar.mjs):
//
//   quizqq/<id>/similar   { "<otherQuestionId>": true, … }  questions on the same point
//   quizqq/<id>/hint      "phrase | phrase"                  stem words that point to the answer
//
// Pure, so it can be unit-tested.

/** Ids of the questions linked as similar to this one. */
export function similarOf(question) {
  const v = question?.similar;
  if (!v) return [];
  const list = Array.isArray(v) ? v : Object.keys(v).filter((k) => v[k]);
  return [...new Set(list.filter((k) => typeof k === 'string' && k && !/[/.#$[\]]/.test(k)))];
}

/** The hint phrases, from "a | b", a list, or a map of them. */
export function hintsOf(question) {
  const v = question?.hint;
  if (!v) return [];
  const list = typeof v === 'string' ? v.split('|') : Array.isArray(v) ? v : Object.values(v);
  return [...new Set(list.map((s) => String(s || '').trim()).filter((s) => s.length >= 2))];
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Splits `text` into [{ text, hit }] pieces, `hit` on every place a hint
 * phrase occurs (any case, whole words where the phrase starts or ends with a
 * letter). Joined back together the pieces are exactly `text`.
 */
export function markHints(text, hints = []) {
  const s = String(text ?? '');
  const parts = hints
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((h) => `${/^\w/.test(h) ? '\\b' : ''}${escape(h).replace(/\s+/g, '\\s+')}${/\w$/.test(h) ? '\\b' : ''}`);
  if (!s || !parts.length) return [{ text: s, hit: false }];
  const re = new RegExp(parts.join('|'), 'gi');
  const out = [];
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (!m[0]) continue;
    if (m.index > last) out.push({ text: s.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), hit: false });
  return out.length ? out : [{ text: s, hit: false }];
}
