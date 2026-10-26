// Re-ranking of textbook passages for "From my textbooks" (books.js).
//
// Plain JavaScript with no imports, so the app's tests (node --test) run it.

// Meaning alone can rank a passage about the right topic above the one that
// names the exact drug, dose or syndrome asked about. So the closest
// CANDIDATES by meaning are re-ranked with the words they share with the
// question (rarer words among the candidates count for more).
const KEYWORD_WEIGHT = 0.35;
const STOP = new Set(
  ('the and for with from that this which what when where who whom whose why how are was were been being has have had ' +
    'not but all any can could should would may might must will shall into onto than then them they their there these ' +
    'those such very most more less also only each other some about above below after before between both does did doing ' +
    'over under again further once here same own just your you our out off too nor its it').split(' '),
);

/** The question's words worth matching: 3+ letters (or any number), no stop words. */
export function keywords(text) {
  const words = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]+(?:[-'][a-z0-9]+)*/g) || [];
  return [...new Set(words.filter((w) => (w.length >= 3 || /\d/.test(w)) && !STOP.has(w)))];
}

/**
 * Re-ranks candidates [{ score, text }] by meaning and shared words together.
 * Returns them with `keyword` (0-1) and `rank` (the combined score), best first.
 */
export function rerank(query, candidates) {
  const terms = keywords(query);
  if (!terms.length || !candidates.length) return candidates.map((c) => ({ ...c, keyword: 0, rank: c.score }));
  const docs = candidates.map((c) => ` ${keywords(c.text).join(' ')} `);
  // How rare each word is among the candidates (a smoothed idf).
  const idf = Object.fromEntries(
    terms.map((t) => {
      const df = docs.filter((d) => d.includes(` ${t} `)).length;
      return [t, Math.log(1 + (docs.length + 1) / (df + 0.5))];
    }),
  );
  const max = terms.reduce((s, t) => s + idf[t], 0) || 1;
  const vs = candidates.map((c) => c.score);
  const lo = Math.min(...vs);
  const span = Math.max(...vs) - lo || 1;
  return candidates
    .map((c, i) => {
      const keyword = terms.reduce((s, t) => s + (docs[i].includes(` ${t} `) ? idf[t] : 0), 0) / max;
      const meaning = (c.score - lo) / span;
      return { ...c, keyword: Math.round(keyword * 1000) / 1000, rank: (1 - KEYWORD_WEIGHT) * meaning + KEYWORD_WEIGHT * keyword };
    })
    .sort((a, b) => b.rank - a.rank);
}
