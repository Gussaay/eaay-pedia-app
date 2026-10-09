// Loading a whole mnemonic book: its chapter decks and every card in them.
//
// A book is small (a few hundred cards), and the chapter, section and source
// views all need the same cards, so it is read once — one read per deck, in
// parallel — and sliced in memory.
import { getList, getOne, num } from './rtdb';
import { loadCards } from './flashcardData';
import { parseRef } from './mnemonicLinks';

export async function loadBook(bookSource) {
  const decks = (await getList('flashdecks'))
    .filter((d) => d.source === bookSource)
    .sort((a, b) => num(a.order) - num(b.order) || String(a.title || '').localeCompare(b.title || ''));
  const lists = await Promise.all(
    decks.map((d) => loadCards(d._key).then((cards) => cards.map((c) => ({ ...c, deck: d._key, deckTitle: d.title })))),
  );
  return { decks, cards: lists.flat() };
}

/** mnemonic_links/<deckId>: { cardId: { mnemonicRef: true } }. */
export const loadDeckLinks = (deckId) => getOne(`mnemonic_links/${deckId}`).then((v) => v || {});

/** Loads cards by ref, keeping the order and dropping any that are gone. */
export async function loadByRefs(refs = []) {
  const cards = await Promise.all(
    refs.map(async (r) => {
      const p = parseRef(r);
      if (!p) return null;
      const c = await getOne(`flashcard_items/${p.deck}/${p.card}`);
      return c ? { ...c, _key: p.card, deck: p.deck, _ref: r } : null;
    }),
  );
  return cards.filter(Boolean);
}

/**
 * Every ordinary (non-mnemonic) flashcard, for linking mnemonics to the facts
 * they cover. Several thousand cards, so it is only loaded when the admin asks
 * to link, and kept for the rest of the visit.
 */
let poolPromise = null;
export function loadFlashcardPool() {
  if (!poolPromise) {
    poolPromise = Promise.all([getList('flashcategory'), getList('flashbooks'), getList('flashdecks')])
      .then(async ([cats, books, decks]) => {
        const mnemonicCats = new Set(cats.filter((c) => c.kind === 'mnemonic').map((c) => c.source));
        const bookOf = new Map(books.map((b) => [b.source, b]));
        const plain = decks.filter((d) => !mnemonicCats.has(bookOf.get(d.source)?.main_category) && d.kind !== 'mnemonic');
        const lists = await Promise.all(
          plain.map((d) =>
            loadCards(d._key).then((cards) =>
              cards.map((c) => ({ ...c, deck: d._key, deckTitle: d.title, bookTitle: bookOf.get(d.source)?.title || '' })),
            ),
          ),
        );
        return lists.flat();
      })
      .catch((e) => {
        poolPromise = null;
        throw e;
      });
  }
  return poolPromise;
}
