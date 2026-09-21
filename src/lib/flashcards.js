// Flashcard scheduling and progress maths. Pure functions, no React and no
// Firebase, so the behaviour can be tested: npm test.
//
// Scheduling is a Leitner box system. A card sits in one of five boxes; answer
// it well and it moves up and comes back later, get it wrong and it drops to
// box 1 and comes back today. It is chosen over an SM-2/Anki-style ease factor
// because a learner can actually see what it is doing — "box 4 of 5, back in a
// week" is something you can reason about, while a hidden ease multiplier is
// not — and because it needs one small number per card rather than three.
//
// Unlike the older nodes shared with the Sketchware app, these records store
// real numbers and booleans. Nothing else reads them, and the strings-for-
// numbers convention elsewhere only exists to keep that old app working.

/** Days until a card in each box comes back. Index 0 is unused. */
export const BOX_INTERVALS = [0, 1, 2, 4, 8, 16];
export const MAX_BOX = 5;

export const RATINGS = ['again', 'good', 'easy'];

// ---------------------------------------------------------------------------
// Dates. Stored as "YYYY-MM-DD": sortable, readable in the database, and free
// of the timezone traps that come with storing an instant for a "day".
// ---------------------------------------------------------------------------
export function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(day, days) {
  const [y, m, d] = String(day).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + days);
  return today(date);
}

export const daysBetween = (from, to) => {
  const a = Date.parse(`${from}T00:00:00`);
  const b = Date.parse(`${to}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
};

// ---------------------------------------------------------------------------
// Card state
// ---------------------------------------------------------------------------
/** A card nobody has answered yet. */
export const blankProgress = () => ({ box: 0, due: '', seen: 0, right: 0, wrong: 0, last: '' });

export const isNew = (p) => !p || !p.box;
export const isMastered = (p) => !!p && p.box >= MAX_BOX;

export function isDue(p, day = today()) {
  if (isNew(p)) return false;      // new cards are offered separately
  if (!p.due) return true;
  return p.due <= day;
}

/**
 * Applies an answer and returns the new progress. Never mutates its input.
 *
 * "again" always sends the card back to box 1 and makes it due today, so a
 * card you just failed reappears before the session ends rather than in a
 * day's time — that repetition is the point of the session.
 */
export function gradeCard(prev, rating, day = today()) {
  const p = { ...blankProgress(), ...(prev || {}) };
  const box = p.box || 0;

  let nextBox;
  if (rating === 'again') nextBox = 1;
  else if (rating === 'easy') nextBox = Math.min(MAX_BOX, box + 2);
  else nextBox = Math.min(MAX_BOX, box + 1);

  const correct = rating !== 'again';
  return {
    box: nextBox,
    due: rating === 'again' ? day : addDays(day, BOX_INTERVALS[nextBox]),
    seen: p.seen + 1,
    right: p.right + (correct ? 1 : 0),
    wrong: p.wrong + (correct ? 0 : 1),
    last: day,
  };
}

// ---------------------------------------------------------------------------
// Building a session
// ---------------------------------------------------------------------------
/**
 * Cards to study now, in the order to show them.
 *
 * mode:
 *   'due'   cards that have come back round, then new ones to fill the session
 *   'new'   only cards never answered
 *   'weak'  the ones being got wrong most — what the gaps screen sends you to
 *   'all'   everything, oldest-seen first
 *
 * `limit` keeps a session finishable. An endless queue is the main reason
 * people abandon flashcards, so a deck of 400 still ends after 20.
 */
export function buildSession(cards, progress = {}, { mode = 'due', limit = 20, day = today() } = {}) {
  const withProgress = cards.map((card) => ({ card, p: progress[card._key] || null }));

  if (mode === 'new') {
    return withProgress.filter((x) => isNew(x.p)).slice(0, limit).map((x) => x.card);
  }

  if (mode === 'weak') {
    return withProgress
      .filter((x) => x.p && x.p.wrong > 0)
      .sort((a, b) => accuracyOf(a.p) - accuracyOf(b.p) || b.p.wrong - a.p.wrong)
      .slice(0, limit)
      .map((x) => x.card);
  }

  if (mode === 'all') {
    return withProgress
      .sort((a, b) => (a.p?.last || '').localeCompare(b.p?.last || ''))
      .slice(0, limit)
      .map((x) => x.card);
  }

  // 'due': overdue first, because a card three days late is the one closest to
  // being forgotten. New cards top up whatever room is left.
  const due = withProgress
    .filter((x) => isDue(x.p, day))
    .sort((a, b) => (a.p.due || '').localeCompare(b.p.due || ''));
  const fresh = withProgress.filter((x) => isNew(x.p));
  return [...due, ...fresh].slice(0, limit).map((x) => x.card);
}

export const accuracyOf = (p) => {
  const total = (p?.right || 0) + (p?.wrong || 0);
  return total ? (p.right / total) * 100 : 0;
};

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------
/** Counts for one deck: what is new, waiting, being learned, and finished. */
export function deckSummary(cards, progress = {}, day = today()) {
  let fresh = 0;
  let due = 0;
  let learning = 0;
  let mastered = 0;
  let right = 0;
  let wrong = 0;

  cards.forEach((card) => {
    const p = progress[card._key];
    if (isNew(p)) {
      fresh += 1;
      return;
    }
    right += p.right || 0;
    wrong += p.wrong || 0;
    if (isMastered(p)) mastered += 1;
    else learning += 1;
    if (isDue(p, day)) due += 1;
  });

  const answered = right + wrong;
  return {
    total: cards.length,
    new: fresh,
    due,
    learning,
    mastered,
    accuracy: answered ? Math.round((right / answered) * 100) : null,
    // What the ring on the deck card fills up: finished, not merely started.
    progress: cards.length ? Math.round((mastered / cards.length) * 100) : 0,
  };
}

/**
 * Where someone is losing marks, worst first.
 *
 * Only systems with enough answers to mean anything are ranked — one wrong
 * answer out of one is not a knowledge gap, and showing it as 0% would send
 * people off to revise something they have barely met.
 */
export function findGaps(decks, progressByDeck = {}, { minAnswers = 5 } = {}) {
  const systems = new Map();

  decks.forEach((deck) => {
    const key = deck.system || 'Other';
    const entry = systems.get(key) || { system: key, right: 0, wrong: 0, mastered: 0, cards: 0, decks: [] };
    const progress = progressByDeck[deck._key] || {};

    Object.values(progress).forEach((p) => {
      entry.right += p.right || 0;
      entry.wrong += p.wrong || 0;
      if (isMastered(p)) entry.mastered += 1;
    });
    entry.cards += Number(deck.count) || 0;
    entry.decks.push(deck.title);
    systems.set(key, entry);
  });

  return [...systems.values()]
    .map((e) => {
      const answered = e.right + e.wrong;
      return {
        ...e,
        answered,
        accuracy: answered ? Math.round((e.right / answered) * 100) : null,
        enough: answered >= minAnswers,
      };
    })
    .sort((a, b) => {
      if (a.enough !== b.enough) return a.enough ? -1 : 1;
      return (a.accuracy ?? 101) - (b.accuracy ?? 101);
    });
}

/**
 * Keeps a daily streak going. Yesterday continues it, today leaves it alone,
 * and anything older starts again at 1.
 */
export function bumpStreak(stats, day = today()) {
  const last = stats?.lastDay || '';
  const streak = Number(stats?.streak) || 0;
  if (last === day) return { streak: streak || 1, lastDay: day };
  if (last && daysBetween(last, day) === 1) return { streak: streak + 1, lastDay: day };
  return { streak: 1, lastDay: day };
}
