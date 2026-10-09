// Links between mnemonics and the flashcards they help you remember.
//
// A mnemonic is the memory hook; the facts stay in the flashcards. Instead of
// copying a fact into both, a mnemonic card lists the flashcards it covers and
// each of those flashcards points back at it:
//
//   flashcard_items/<mDeck>/<mCard>/links     { "<fDeck>~<fCard>": true, … }
//   mnemonic_links/<fDeck>/<fCard>            { "<mDeck>~<mCard>": true, … }
//
// The second is a reverse index, so a flashcard study session can find the
// mnemonics for its whole deck in one small read instead of loading every
// mnemonic in the app. Both sides are always written together (linkUpdates).
//
// "~" joins the two ids because database keys cannot contain "/", and push
// keys never contain "~".
// Pure, so it can be unit-tested; the reads are in mnemonicData.js.

export const refOf = (deck, card) => `${deck}~${card}`;

export function parseRef(ref) {
  const [deck, card] = String(ref || '').split('~');
  return deck && card ? { deck, card } : null;
}

/** The refs a card links to, whether stored as a map or (older) as a list. */
export function linksOf(card) {
  const v = card?.links;
  if (!v) return [];
  const list = Array.isArray(v) ? v : Object.keys(v).filter((k) => v[k]);
  return [...new Set(list.filter((r) => parseRef(r)))];
}

/** { "<fDeck>~<fCard>": true } — the shape stored on a mnemonic card. */
export const linksMap = (refs = []) => (refs.length ? Object.fromEntries(refs.map((r) => [r, true])) : null);

/**
 * The database writes that change one mnemonic's links from `before` to
 * `after`, on both sides. Pass `after = []` when the mnemonic is deleted.
 */
export function linkUpdates(mnemonicRef, before = [], after = []) {
  const m = parseRef(mnemonicRef);
  if (!m) return {};
  const updates = {};
  const keep = new Set(after);
  before.forEach((r) => {
    const f = parseRef(r);
    if (f && !keep.has(r)) updates[`mnemonic_links/${f.deck}/${f.card}/${mnemonicRef}`] = null;
  });
  after.forEach((r) => {
    const f = parseRef(r);
    if (f) updates[`mnemonic_links/${f.deck}/${f.card}/${mnemonicRef}`] = true;
  });
  return updates;
}

/** The first mnemonic linked to a flashcard, from one deck's link map. */
export function mnemonicFor(deckLinks, cardId) {
  const v = deckLinks?.[cardId];
  if (!v) return null;
  const first = Object.keys(v).find((k) => v[k] && parseRef(k));
  return first || null;
}

/** The study screen for the flashcards behind some mnemonics. */
export const testPath = (mnemonicRefs = [], back = '') =>
  `/flashcards/linked?m=${mnemonicRefs.join(',')}&mode=all&limit=0${back ? `&back=${encodeURIComponent(back)}` : ''}`;
