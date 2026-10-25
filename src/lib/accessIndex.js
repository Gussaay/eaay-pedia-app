// The three small lookup nodes the database rules use to enforce the quiz
// lock (database.rules.json, "quizqq"). Rules cannot search, so they look
// these up instead:
//
//   qkey/<quiz key>        = book source     (allquiz/<id>/key → its book)
//   qbook/<book source>    = { bank, group } (a book's place, as unlock keys use them)
//   qset/<bchap or bsci>   = bank            (a chapter or section set → its bank)
//
// scripts/access-index.mjs rebuilds them all every day; the admin screens add
// entries as they create quizzes, books and questions, so new content opens
// for unlocked people straight away.
//
// Plain JavaScript with no app imports, so the script can use it under node.
import { encodeKey } from './access.js';

// Database keys cannot hold these; such entries are left out (the questions
// stay readable to anyone with full access).
const BAD = /[.#$[\]/]/;
const okKey = (k) => typeof k === 'string' && k !== '' && !BAD.test(k);

/**
 * Root-relative paths to write for one quiz, book or question. Any field may
 * be left out. Group and bank are stored encoded exactly as in an unlock key
 * (lib/access.js scopeKey), so the rule can rebuild "group~<bank>|<group>".
 */
export function indexEntries({ quizKey, source, bank, group, bchap, bsci } = {}) {
  const out = {};
  if (okKey(quizKey) && okKey(source)) out[`qkey/${quizKey}`] = source;
  if (okKey(source) && bank) {
    out[`qbook/${source}/bank`] = encodeKey(bank);
    out[`qbook/${source}/group`] = group ? encodeKey(String(group).trim()) : null;
  }
  for (const set of [bchap, bsci]) {
    if (!okKey(set)) continue;
    const b = set.split('|')[0];
    if (b && !set.endsWith('|')) out[`qset/${set}`] = encodeKey(b);
  }
  return out;
}
