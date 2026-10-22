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
 * The small slice of markdown the models use in a reply, as blocks to render:
 * { type: 'p' | 'li' | 'h' | 'hr' | 'table', parts: [{ text, bold, italic? }] }.
 * A numbered item keeps its number as `num`; a table has `rows` of cells (each
 * a parts list), the first row being the header. Rendering it ourselves keeps
 * model output out of innerHTML.
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

const ITALIC = /(?<![*\w])[*_](?![\s*_])([^*_\n]+?)(?<![\s*_])[*_](?![*\w])/g;

/** Inline text: **bold**, *italic*. */
function inline(text) {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .flatMap((t, i) => {
      if (i % 2 === 1) return [{ text: t, bold: true }];
      return t.split(ITALIC).map((u, j) => (j % 2 === 1 ? { text: u, bold: false, italic: true } : { text: u, bold: false }));
    })
    .filter((p) => p.text);
}

const isRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isRule = (line) => /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{0,}:?\s*\|?\s*$/.test(line);
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(plainMath(c.trim()).replace(/<br\s*\/?>/gi, ' ')));

export function parseReply(text) {
  const lines = s(text).split('\n').map((line) => line.trimEnd()).filter((line) => line.trim());
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isRow(line) && i + 1 < lines.length && isRule(lines[i + 1])) {
      const rows = [cells(line)];
      for (i += 2; i < lines.length && isRow(lines[i]); i++) rows.push(cells(lines[i]));
      i--;
      out.push({ type: 'table', parts: [], rows });
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push({ type: 'hr', parts: [] });
      continue;
    }
    let type = 'p';
    let num;
    let body = plainMath(line.trim());
    const ol = body.match(/^(\d+)[.)]\s+(.*)$/);
    const li = body.match(/^[-*•]\s+(.*)$/);
    const h = body.match(/^#{1,6}\s+(.*)$/);
    if (h) { type = 'h'; body = h[1]; } else if (ol) { type = 'li'; num = ol[1]; body = ol[2]; } else if (li) { type = 'li'; body = li[1]; }
    out.push({ type, parts: inline(body), ...(num ? { num } : {}) });
  }
  return out;
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
