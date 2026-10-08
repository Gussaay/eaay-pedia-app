// Which sheet of a workbook holds the data we are importing.
//
// Both importers used to read the FIRST sheet and nothing else. That is fine
// for a file built for one purpose, but it makes a single workbook per subject
// impossible: put Flashcards, MCQs and Summary side by side and the question
// importer reads the flashcards and fails, or worse, half-succeeds.
//
// So instead of trusting position, look at the headers. A sheet of MCQs has
// question/a/b/c/answer columns; a sheet of flashcards has front/back. Score
// every sheet against the field map the caller already owns and take the best,
// while still handing back the full list so the person can choose another.
//
// Pure logic (no React, no SheetJS) so it can be unit-tested: npm test.

/** Header names on a sheet, from the first row of its JSON rows. */
export const headersOf = (rows) => (rows && rows.length ? Object.keys(rows[0]) : []);

/**
 * How well one sheet matches a set of fields.
 *
 * `required` fields are what make a sheet the right KIND of sheet — a
 * flashcard sheet must have a front and a back. Without them the score is 0,
 * however many other columns happen to line up, which stops a summary sheet
 * with a "note" column from looking like a deck of cards.
 */
export function scoreSheet(rows, { fieldFor, required = [], disqualify }) {
  const headers = headersOf(rows);
  // Some sheets satisfy the required fields by accident. A sheet of MCQs has a
  // "question" and an "a" column, which the flashcard aliases read as a front
  // and a back - so without this it would import 50 questions as 50 cards.
  if (disqualify && disqualify(headers)) return { score: 0, matched: [] };
  const matched = new Set();
  headers.forEach((h) => {
    const field = fieldFor(h);
    if (field) matched.add(field);
  });
  if (required.some((f) => !matched.has(f))) return { score: 0, matched: [...matched] };
  // Recognised columns, then rows, so that a sheet with the same columns but
  // actual content beats an empty template left in the workbook.
  return { score: matched.size * 1000 + Math.min(rows.length, 999), matched: [...matched] };
}

/**
 * Picks the best sheet. `sheets` is [{ name, rows }] in workbook order.
 * Returns the winner plus every candidate, so the UI can say which was used
 * and offer the others.
 */
export function pickSheet(sheets, { fieldFor, required = [], disqualify }) {
  const candidates = (sheets || []).map(({ name, rows }) => ({
    name,
    rows: rows || [],
    ...scoreSheet(rows || [], { fieldFor, required, disqualify }),
  }));
  // Stable: the first sheet wins a tie, which keeps single-sheet files behaving
  // exactly as they did before.
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a), candidates[0] || null);
  return {
    best: best && best.score > 0 ? best : null,
    candidates,
    usable: candidates.filter((c) => c.score > 0),
  };
}

const normalize = (h) =>
  String(h || '')
    .toLowerCase()
    .replace(/[\s_\-.()]/g, '')
    .trim();

/**
 * Does this sheet hold multiple-choice questions?
 *
 * A stem, three or more lettered options and an answer key is a shape no deck
 * of flashcards has. The flashcard importer uses this to leave the MCQ sheet
 * of a combined workbook alone.
 */
export function looksLikeMcqSheet(headers) {
  const set = new Set((headers || []).map(normalize));
  const has = (...names) => names.some((n) => set.has(n));
  const options = ['a', 'b', 'c', 'd', 'e'].filter((k) => has(k, `option${k}`, `choice${k}`)).length;
  return has('question', 'stem', 'questiontext') && options >= 3 && has('answer', 'correct', 'correctanswer', 'key');
}
