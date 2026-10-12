// Pure helpers for the AI study helper (no React, no Firebase): npm test.
//
// Whatever Gemini returns is checked before the app shows it. A schema makes
// malformed output rare, not impossible, and one bad question with no options
// would otherwise break the quiz runner.
import { OPTION_KEYS } from './quiz.js';

const s = (v) => String(v ?? '').trim();

/** Keeps only playable MCQs: a question, at least two options, a key that points at one. */
export function normalizeMcqs(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      const q = { question: s(it?.question), exp: s(it?.exp), answer: s(it?.answer).toLowerCase().replace(/[^a-e]/g, '') };
      OPTION_KEYS.forEach((k) => { q[k] = s(it?.[k]).replace(/^[a-e][.)]\s+/i, ''); });
      return q;
    })
    .filter((q) => q.question && OPTION_KEYS.filter((k) => q[k]).length >= 2 && q.answer && q[q.answer]);
}

/** Keeps only cards with both sides. */
export function normalizeCards(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({ front: s(it?.front), back: s(it?.back), hint: s(it?.hint) }))
    .filter((c) => c.front && c.back);
}

const csvCell = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** MCQs as a CSV the admin Import accepts (same columns as its template). */
export const mcqsToCsv = (qs) =>
  [['question', 'a', 'b', 'c', 'd', 'e', 'answer', 'exp'], ...qs.map((q) => [q.question, q.a, q.b, q.c, q.d, q.e, q.answer, q.exp])]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');

/** Cards as a CSV the flashcard "Upload a set" accepts. */
export const cardsToCsv = (cards) =>
  [['front', 'back', 'hint'], ...cards.map((c) => [c.front, c.back, c.hint])]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');

/**
 * The small slice of markdown Gemini uses in a reply, as blocks to render:
 * { type: 'p' | 'li' | 'h', parts: [{ text, bold }] }. Rendering it ourselves
 * keeps model output out of innerHTML.
 */
export function parseReply(text) {
  return s(text)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .map((line) => {
      let type = 'p';
      let body = line.trim();
      const li = body.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
      const h = body.match(/^#{1,6}\s+(.*)$/);
      if (h) { type = 'h'; body = h[1]; } else if (li) { type = 'li'; body = li[1]; }
      const parts = body.split(/\*\*(.+?)\*\*/g).map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter((p) => p.text);
      return { type, parts };
    });
}
