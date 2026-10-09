// Mnemonics are flashcards with a picture on the back.
//
// They live in the same tree as the flashcards (flashcategory -> flashbooks ->
// flashdecks -> flashcard_items) so they get the same study screen, spaced
// repetition and progress for free. What makes them mnemonics is one field on
// the category: `kind: 'mnemonic'`. The Mnemonics section lists only those
// categories and the Flash Cards section leaves them out, so the two never
// show up in each other's lists.

export const MNEMONIC = 'mnemonic';

export const isMnemonicCategory = (c) => c?.kind === MNEMONIC;

/**
 * The book sources that sit under a mnemonic category. Decks are linked to
 * books by source, and books to categories by main_category, so this is the
 * set to test a deck's `source` against.
 */
export function mnemonicBookSources(categories = [], books = []) {
  const cats = new Set(categories.filter(isMnemonicCategory).map((c) => c.source));
  return new Set(books.filter((b) => cats.has(b.main_category)).map((b) => b.source));
}

/**
 * A card whose back is only a picture. The study screen gives these the whole
 * back face for the image instead of squeezing it under an empty answer.
 */
export const isPictureBack = (card) => !!card?.back_img && !String(card?.back || '').trim();

/**
 * A card whose back is drawn by the app from a small description (see
 * components/MnemonicVisual.jsx) rather than an uploaded picture.
 */
export const hasVisualBack = (card) => !!card?.visual;

// ---------------------------------------------------------------------------
// Study sets
//
// A mnemonic book (e.g. MRCPCH › Theory and Science) has one deck per clinical
// chapter. Each card also carries its basic-science section in `chapter`
// (Pharmacology, Physiology… or Clinical) and where it came from in `source`.
// A study set is any slice of the book: one chapter, one section across every
// chapter, one source, or a combination.
// ---------------------------------------------------------------------------

/** Display order for sections; anything unlisted sorts after these. */
export const SECTION_ORDER = [
  'Clinical',
  'Anatomy',
  'Physiology',
  'Biochemistry',
  'Pharmacology',
  'Microbiology',
  'Immunology',
  'Genetics',
  'Statistics',
];

export const sectionOf = (card) => String(card?.chapter || '').trim() || 'Clinical';
export const sourceOf = (card) => String(card?.source || '').trim() || 'Other';

/** The cards in a set. Empty filters mean "any". */
export function filterSet(cards = [], { deck = '', section = '', source = '' } = {}) {
  return cards.filter(
    (c) =>
      (!deck || c.deck === deck) &&
      (!section || sectionOf(c) === section) &&
      (!source || sourceOf(c) === source),
  );
}

/** [{ name, total }] for whatever `keyOf` picks, in `order` then by size. */
export function tallyBy(cards = [], keyOf, order = []) {
  const counts = new Map();
  cards.forEach((c) => {
    const k = keyOf(c);
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  const rank = (name) => (order.includes(name) ? order.indexOf(name) : order.length);
  return [...counts.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => rank(a.name) - rank(b.name) || b.total - a.total || a.name.localeCompare(b.name));
}

/** A heading for a set, e.g. "Cardiology · Pharmacology" or "Pharmacology — all chapters". */
export function setTitle({ deckTitle = '', section = '', source = '' } = {}) {
  if (deckTitle && section) return `${deckTitle} · ${section}`;
  if (deckTitle) return deckTitle;
  if (section && source) return `${section} · ${source}`;
  if (section) return `${section} — all chapters`;
  if (source) return source;
  return 'All mnemonics';
}

/** The query string that names a set, leaving out empty filters. */
export function setQuery({ book = '', deck = '', section = '', source = '' } = {}) {
  const q = new URLSearchParams();
  if (book) q.set('book', book);
  if (deck) q.set('deck', deck);
  if (section) q.set('section', section);
  if (source) q.set('source', source);
  return q.toString();
}

/** A stable id for a set, for remembering an unfinished session. */
export const setKey = (filters = {}) =>
  ['book', 'deck', 'section', 'source'].map((k) => filters[k] || '').join('|');

/** One progress map for many decks: { cardId: progress }. */
export function flattenProgress(byDeck = {}, deckIds = []) {
  const out = {};
  deckIds.forEach((id) => Object.assign(out, byDeck?.[id] || {}));
  return out;
}
