// Loading a whole mnemonic book: its chapter decks and every card in them.
//
// A book is small (a few hundred cards), and the chapter, section and source
// views all need the same cards, so it is read once — one read per deck, in
// parallel — and sliced in memory.
import { getList, num } from './rtdb';
import { loadCards } from './flashcardData';

export async function loadBook(bookSource) {
  const decks = (await getList('flashdecks'))
    .filter((d) => d.source === bookSource)
    .sort((a, b) => num(a.order) - num(b.order) || String(a.title || '').localeCompare(b.title || ''));
  const lists = await Promise.all(
    decks.map((d) => loadCards(d._key).then((cards) => cards.map((c) => ({ ...c, deck: d._key, deckTitle: d.title })))),
  );
  return { decks, cards: lists.flat() };
}
