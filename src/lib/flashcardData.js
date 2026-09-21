// Reading and writing flashcards in the Realtime Database.
//
// WHY THE REALTIME DATABASE AND NOT FIRESTORE
//
// Firestore bills per document read; the Realtime Database bills for bytes
// transferred. A 300-card deck is 300 reads in Firestore but one ~60 KB
// download here, and the free tier allows 50,000 reads a day against 10 GB a
// month. With this app's numbers, a few hundred people studying a deck a day
// would exhaust Firestore's daily reads before lunch and use about a tenth of
// the Realtime Database's monthly allowance.
//
// The shape of the work suits it too: a study session loads one deck, works
// through it offline in memory, and saves once at the end. That is a read and
// a write per session, not one per card.
//
// Firestore would win if this needed to query across every card at once
// ("all cards in any deck tagged X, due today, ordered by difficulty"). It
// does not — the deck is the unit people study and the unit we load.
//
//   flashcategory/<key>                     categories   \
//   flashbooks/<key>                        books         | same shape as the
//   flashdecks/<deckId>                     decks        /  MCQ catalogue
//   flashcard_items/<deckId>/<cardId>       the cards: one read per deck
//
// Those first three are separate from the MCQ catalogue's main_category/mcqs/
// allquiz, so flashcards can be organised to suit themselves. They are linked
// down the chain by a "source" string, like the MCQ side, which is why
// deleting a category does not delete the books under it.
//   flashprogress/<uid>/<deckId>/<cardId>   this person's boxes and due dates
//   flashstats/<uid>                        totals, streak, per-system tallies
//
// The cards are NOT under `flashcards`. That node already exists and belongs
// to the old Sketchware app, which keeps per-topic scores there — writing
// decks into it would mix two unrelated things in one place and put live data
// within reach of this screen's "delete all" button.
import { getList, getOne, num, removeAt, updatePaths } from './rtdb';
import { bumpStreak, today } from './flashcards';

/** Database keys cannot contain . # $ [ ] or /, and system names might. */
export const safeKey = (name) =>
  String(name || 'other')
    .trim()
    .replace(/[.#$[\]/]/g, '_')
    .slice(0, 100) || 'other';

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------
export const loadDecks = () => getList('flashdecks');

export async function loadCards(deckId) {
  const cards = await getList(`flashcard_items/${deckId}`);
  // Decks that follow a chapter need to stay in the author's order; push keys
  // alone would only give the order they happened to be written in.
  return cards.sort((a, b) => num(a.order) - num(b.order));
}

export const loadDeckProgress = (uid, deckId) =>
  uid ? getOne(`flashprogress/${uid}/${deckId}`).then((v) => v || {}) : Promise.resolve({});

export const loadAllProgress = (uid) =>
  uid ? getOne(`flashprogress/${uid}`).then((v) => v || {}) : Promise.resolve({});

export const loadStats = (uid) =>
  uid ? getOne(`flashstats/${uid}`).then((v) => v || {}) : Promise.resolve({});

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------
/**
 * Saves a finished session in one atomic write.
 *
 * Everything goes together on purpose: per-card progress, the running totals
 * and the streak. Saving card by card would be dozens of round trips on a
 * phone connection, and a session that died halfway would leave the totals
 * disagreeing with the cards.
 *
 * `graded` is { cardId: progress } as produced by gradeCard().
 */
export async function saveSession({ uid, deckId, deck, graded, answered, correct, stats }) {
  if (!uid || !deckId) return;
  const day = today();
  const updates = {};

  Object.entries(graded).forEach(([cardId, progress]) => {
    updates[`flashprogress/${uid}/${deckId}/${cardId}`] = progress;
  });

  const system = safeKey(deck?.system);
  const prevSystem = stats?.systems?.[system] || {};
  const streak = bumpStreak(stats, day);

  updates[`flashstats/${uid}/totalSeen`] = (num(stats?.totalSeen) || 0) + answered;
  updates[`flashstats/${uid}/totalRight`] = (num(stats?.totalRight) || 0) + correct;
  updates[`flashstats/${uid}/totalWrong`] = (num(stats?.totalWrong) || 0) + (answered - correct);
  updates[`flashstats/${uid}/sessions`] = (num(stats?.sessions) || 0) + 1;
  updates[`flashstats/${uid}/streak`] = streak.streak;
  updates[`flashstats/${uid}/lastDay`] = streak.lastDay;

  updates[`flashstats/${uid}/systems/${system}/name`] = deck?.system || 'Other';
  updates[`flashstats/${uid}/systems/${system}/seen`] = (num(prevSystem.seen) || 0) + answered;
  updates[`flashstats/${uid}/systems/${system}/right`] = (num(prevSystem.right) || 0) + correct;
  updates[`flashstats/${uid}/systems/${system}/wrong`] =
    (num(prevSystem.wrong) || 0) + (answered - correct);

  await updatePaths(updates);
}

/** Forgets one deck's progress, so it can be studied from scratch. */
export const resetDeckProgress = (uid, deckId) => removeAt(`flashprogress/${uid}/${deckId}`);

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
/**
 * Keeps flashdecks/<id>/count in step with the cards actually stored.
 * The deck list shows it without reading every card, so it has to be written
 * whenever cards are added or removed.
 */
export const setDeckCount = (deckId, count) =>
  updatePaths({ [`flashdecks/${deckId}/count`]: count });

/** Deletes a deck and every card in it, in one write. */
export async function deleteDeck(deckId) {
  await updatePaths({
    [`flashdecks/${deckId}`]: null,
    [`flashcard_items/${deckId}`]: null,
  });
  // Progress is left alone: it is per user, spread across every account, and
  // cannot be reached from here. It becomes unreachable, which is harmless.
}
