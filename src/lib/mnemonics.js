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
