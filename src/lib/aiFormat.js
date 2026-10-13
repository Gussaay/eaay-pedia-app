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
 * { type: 'p' | 'li' | 'h' | 'hr', parts: [{ text, bold }] }. Rendering it ourselves
 * keeps model output out of innerHTML.
 */
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋' };
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻' };
const script = (map) => (_, a, b) => [...(a ?? b)].map((c) => map[c] ?? c).join('');

/** Gemini sometimes writes chemistry as LaTeX ($NaHCO_3$, $Ca^{2+}$): show it as plain text. */
export const plainMath = (text) =>
  text.replace(/\$(?![\s\d])([^$\n]{1,60}?)(?<!\s)\$/g, (_, m) =>
    m
      .replace(/\\(?:text|mathrm)\{([^}]*)\}/g, '$1')
      .replace(/_\{([0-9+-]+)\}|_([0-9+-]+)/g, script(SUB))
      .replace(/\^\{([0-9+-]+)\}|\^([0-9+-]+)/g, script(SUP)),
  );

export function parseReply(text) {
  return s(text)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .map((line) => {
      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return { type: 'hr', parts: [] };
      let type = 'p';
      let body = plainMath(line.trim());
      const li = body.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
      const h = body.match(/^#{1,6}\s+(.*)$/);
      if (h) { type = 'h'; body = h[1]; } else if (li) { type = 'li'; body = li[1]; }
      const parts = body.split(/\*\*(.+?)\*\*/g).map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter((p) => p.text);
      return { type, parts };
    });
}

/**
 * Tells whether a saved AI conversation still belongs to a question: it is
 * thrown away once the stem, options or key are edited.
 */
export function questionFingerprint(q) {
  const str = [q?.question, q?.a, q?.b, q?.c, q?.d, q?.e, q?.answer].map(s).join('\u0001');
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
