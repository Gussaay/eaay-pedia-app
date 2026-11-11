// Reading and writing OSPE picture cards (ospe/cards/<id>) and a person's
// progress on them (flashprogress/<uid>/ospe/<cardId>).
//
// All the cards come down in one cached read, like a flashcard deck: a few
// hundred small records, grouped in memory by ../../functions/ospeCore.js, and
// kept for offline use by getOneCached. Progress uses the flashcard Leitner
// boxes, under a fixed "ospe" deck id so it never mixes with a real deck.
import { getOneCached, updateAt, updatePaths } from './rtdb';
import { ospeScience, sourcePaths, visibleCards } from '../../functions/ospeCore.js';
import { isDue, isNew } from './flashcards';

export { OSPE_KINDS, groupBySystem, groupBySource, groupByScience, ospeScience } from '../../functions/ospeCore.js';

const raw = () => getOneCached('ospe/cards').then((v) => v || {});

/** The cards people can study (checked and auto), by title. */
export const loadOspeCards = () => raw().then(visibleCards);

/** Every card whatever its status, for the admin review page. */
export const loadAllOspeCards = () =>
  raw().then((all) => Object.entries(all).filter(([, c]) => c).map(([_key, c]) => ({ _key, ...c })));

/** Admin edit: merges `patch` into one card. */
export const saveOspeCard = (id, patch) => updateAt(`ospe/cards/${id}`, patch);

export const loadOspeProgress = (uid) =>
  uid ? getOneCached(`flashprogress/${uid}/ospe`).then((v) => v || {}) : Promise.resolve({});

/** Saves { cardId: progress } in one write. */
export function saveOspeProgress(uid, graded) {
  if (!uid || !Object.keys(graded || {}).length) return Promise.resolve();
  return updatePaths(Object.fromEntries(Object.entries(graded).map(([id, p]) => [`flashprogress/${uid}/ospe/${id}`, p])));
}

/**
 * The cards of one system / topic / kind / source (exam or deck path) /
 * basic science. `chapters` is the known list, so unknown chapters count as 'Other'.
 */
export function filterOspe(cards, { chapter = '', topic = '', kind = '', source = '', science = '' } = {}, chapters = []) {
  const known = new Set(chapters);
  return cards.filter(
    (c) =>
      (!chapter || (known.has(c.chapter) ? c.chapter : 'Other') === chapter) &&
      (!topic || (c.topic || c.title || '') === topic) &&
      (!kind || c.kind === kind) &&
      (!source || sourcePaths(c).includes(source)) &&
      (!science || ospeScience(c) === science),
  );
}

/** Due cards first, then ones never seen, then the rest. `limit` 0 = no limit; `onlyDueAndNew` leaves out the rest. */
export function ospeQueue(cards, progress, { limit = 0, onlyDueAndNew = false } = {}) {
  const due = cards.filter((c) => isDue(progress[c._key]));
  const fresh = cards.filter((c) => isNew(progress[c._key]));
  const rest = onlyDueAndNew ? [] : cards.filter((c) => !isDue(progress[c._key]) && !isNew(progress[c._key]));
  const all = [...due, ...fresh, ...rest];
  return limit > 0 ? all.slice(0, limit) : all;
}
