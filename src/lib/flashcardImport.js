// Bulk upload of a flashcard deck from Excel/CSV.
// Pure logic (no React, no Firebase) so it can be unit-tested: npm test.
//
// Deliberately forgiving about column names. People build these sheets in
// Anki, Quizlet, Word tables and by hand, and each calls the two sides
// something different — rejecting a 300-card file because the header says
// "Term" instead of "front" would be the most annoying possible behaviour.

/** Accepted column names -> field. Case/space/underscore insensitive. */
const HEADER_ALIASES = {
  front: 'front',
  question: 'front',
  q: 'front',
  term: 'front',
  prompt: 'front',
  word: 'front',
  side1: 'front',
  sidea: 'front',

  back: 'back',
  answer: 'back',
  a: 'back',
  definition: 'back',
  meaning: 'back',
  side2: 'back',
  sideb: 'back',

  hint: 'hint',
  clue: 'hint',
  mnemonic: 'hint',

  note: 'note',
  notes: 'note',
  extra: 'note',
  explanation: 'note',
  exp: 'note',
  rationale: 'note',

  img: 'img',
  image: 'img',
  imageurl: 'img',
  frontimage: 'img',
  picture: 'img',

  backimg: 'back_img',
  backimage: 'back_img',
  answerimage: 'back_img',

  tags: 'tags',
  tag: 'tags',
  keywords: 'tags',

  // The card's sub-division inside its deck. This is what the "study these
  // chapters" picker lists, so every one of these spellings has to land in the
  // same field — a sheet calling it "Section" must not produce a second,
  // parallel set of chapters.
  chapter: 'chapter',
  subchapter: 'chapter',
  subcategory: 'chapter',
  section: 'chapter',
  part: 'chapter',
  topic: 'chapter',
  subtopic: 'chapter',

  // Deck-level, and only informational on an import: the deck already knows
  // its own system, and a sheet cannot move cards between decks.
  system: 'system',
  category: 'system',
  specialty: 'system',

  deck: 'deck',
  title: 'deck',
  decktitle: 'deck',
};

export const normalizeHeader = (h) =>
  String(h || '')
    .toLowerCase()
    .replace(/[\s_\-.()]/g, '')
    .trim();

export const fieldForHeader = (h) => HEADER_ALIASES[normalizeHeader(h)] || null;

const clean = (v) =>
  v === undefined || v === null ? '' : String(v).replace(/\r/g, '').replace(/ /g, ' ').trim();

const compare = (v) => clean(v).toLowerCase().replace(/\s+/g, ' ').replace(/[.;:,]+$/, '');

/** "cardiology, murmurs" and "cardiology murmurs" both become a clean list. */
export function parseTags(raw) {
  return clean(raw)
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Converts sheet rows into importable cards.
 * Returns { items, skipped, unknownHeaders }, each item being
 * { row, record, errors[], duplicate }.
 */
export function parseCardRows(rows, { existingCards = [] } = {}) {
  const existing = new Set(existingCards.map((c) => compare(c.front)).filter(Boolean));
  const seen = new Map();
  const unknownHeaders = new Set();
  const items = [];
  let skipped = 0;

  rows.forEach((raw, i) => {
    const values = {};
    Object.entries(raw).forEach(([header, value]) => {
      const field = fieldForHeader(header);
      if (!field) {
        if (clean(value) !== '') unknownHeaders.add(String(header));
        return;
      }
      // First column wins, so a sheet with both "question" and "front" does
      // not silently overwrite one with the other.
      if (values[field] === undefined || values[field] === '') values[field] = clean(value);
    });

    const front = clean(values.front);
    const back = clean(values.back);

    // A blank row in the middle of a sheet is normal and is not an error.
    if (!front && !back && !clean(values.img)) {
      skipped += 1;
      return;
    }

    const errors = [];
    if (!front) errors.push('The front of the card is empty');
    // A card can be a picture with an answer, so an image counts as a front.
    if (!back && !clean(values.back_img)) errors.push('The back of the card is empty');

    const fingerprint = compare(front);
    let duplicate = null;
    if (fingerprint && existing.has(fingerprint)) duplicate = 'in this deck already';
    else if (fingerprint && seen.has(fingerprint)) duplicate = `same as row ${seen.get(fingerprint)}`;
    if (fingerprint && !seen.has(fingerprint)) seen.set(fingerprint, i + 2); // +2: header row, 1-based

    items.push({
      row: i + 2,
      errors,
      duplicate,
      record: {
        front,
        back,
        hint: clean(values.hint),
        note: clean(values.note),
        img: clean(values.img),
        back_img: clean(values.back_img),
        tags: parseTags(values.tags),
        chapter: clean(values.chapter),
      },
      deckFromFile: clean(values.deck),
      systemFromFile: clean(values.system),
    });
  });

  return { items, skipped, unknownHeaders: [...unknownHeaders] };
}

/** Rows that will actually be written. */
export const importableCards = (items, { includeDuplicates = false } = {}) =>
  items.filter((it) => it.errors.length === 0 && (includeDuplicates || !it.duplicate));

/**
 * The record written to flashcards/<deckId>/<cardId>. `order` keeps the
 * sheet's own sequence, which matters when a deck follows a chapter.
 */
export const buildCardRecord = (item, { deckId, order }) => ({
  deck: deckId,
  order,
  ...item.record,
});

export const TEMPLATE_HEADERS = ['front', 'back', 'hint', 'note', 'chapter', 'tags', 'image_url'];

export const TEMPLATE_EXAMPLE = [
  'Most common cause of bronchiolitis in infants',
  'Respiratory syncytial virus (RSV)',
  'Think winter epidemics in under-2s',
  'Accounts for about 70% of cases; peaks at 2-6 months of age.',
  'Lower respiratory tract infection',
  'bronchiolitis, RSV, viral',
  '',
];

/** CSV text for the downloadable template (BOM so Excel keeps UTF-8). */
export function templateCsv() {
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return `﻿${TEMPLATE_HEADERS.join(',')}\n${TEMPLATE_EXAMPLE.map(escape).join(',')}\n`;
}
