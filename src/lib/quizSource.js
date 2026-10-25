// Loads a quiz (metadata + questions) for the two kinds the Android app had:
//  - "exam":    an allquiz/<childKey> record; questions are quizqq where key == allquiz.key
//               (plus any questions it links from other quizzes, allquiz/<id>/order)
//  - "chapter": a chapters/<chapterKey> record played "by system"; questions are
//               quizqq where category1/category2 == chapter name and type == sub-type.
// and one the web app added:
//  - "set":     a slice of a whole bank by chapter and/or basic science (lib/questionBrowse.js).
//  - "ai":      a practice quiz the AI tutor picked for you, aiquiz/<uid>/<id> = { title, keys }
//               (functions/agent.js); questions are quizqq/<key> in that order.
//
// Everything opened online is also saved for offline play (src/lib/offline.js),
// and reads fall back to that copy when the device has no connection.
import { get, query, ref, orderByChild, startAt } from 'firebase/database';
import { auth, db } from '../firebase';
import { getOne, getWhere, toList, num } from './rtdb';
import { listSpots, loadSpot } from './resume';
import { matchesChapter } from './quiz';
import { getQuiz, saveQuiz } from './offline';
import { batchOf, filterLabel, isPersonalFilter, parseFilter, practiceFilter, setTitle, uniqueQuestions } from './questionBrowse';
import { loadAllHistory } from './quizHistory';

const questionCache = new Map();

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Rejects instead of hanging forever when the connection is dead. */
function withTimeout(promise, ms = 20000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms)),
  ]);
}

async function fetchMeta(kind, id, params) {
  if (kind === 'set') return setMeta(id, params);
  if (kind === 'ai') {
    const uid = auth.currentUser?.uid;
    const q = uid && (await getOne(`aiquiz/${uid}/${id}`));
    if (!q) throw new Error('This quiz no longer exists.');
    const keys = toKeys(q.keys);
    return {
      kind,
      id,
      pkey: `ai-${id}`,
      ai: true,
      keys,
      bysystem: false,
      type: '',
      chapter: '?',
      title: q.title || 'AI practice quiz',
      des: 'Picked from the question bank by the AI tutor.',
      uploader: 'AI tutor',
      img: '',
      source: params.source || '',
      name: params.name || '',
      number: keys.length,
    };
  }
  if (kind === 'chapter') {
    const ch = (await getOne(`chapters/${id}`)) || {};
    const type = params.type || '';
    return {
      kind,
      id,
      pkey: `${id}${type}`,
      bysystem: true,
      type,
      chapter: ch.chapter || id,
      title: ch.chapter || id,
      des: 'organized by Dr. Qusay Mohamed from multiple recalls',
      uploader: 'Dr. Qusay Mohamed',
      img: ch.chapter_img || '',
      source: params.source || '',
      name: params.name || '',
      number: num(ch[`${type}number`]),
    };
  }
  const q = await getOne(`allquiz/${id}`);
  if (!q) throw new Error('This quiz no longer exists.');
  return {
    kind: 'exam',
    id,
    pkey: q.key,
    bysystem: false,
    type: q.type || '',
    chapter: '?',
    title: q.title || '',
    des: q.des || '',
    uploader: q.uploader || '',
    img: q.img || '',
    source: q.source || params.source || '',
    name: params.name || '',
    number: num(q.number),
    raw: q,
  };
}

/**
 * A "set": every question of a bank (optionally one book) in one chapter
 * and/or one basic-science section, played like a quiz. The id is the set's
 * own key (setId), so progress and the leaderboard belong to that slice.
 */
function setMeta(id, params) {
  const { bank = '', book = '', chapter = '', science = '', filter = '' } = params;
  const part = Number(params.part) || 0;
  return {
    kind: 'set',
    id,
    pkey: id,
    bysystem: false,
    set: true,
    bank,
    book,
    science,
    filter,
    part,
    type: '',
    chapter: chapter || '?',
    filterChapter: chapter,
    title: setTitle({ chapter, science, filter, part, bookTitle: params.bookTitle || '' }),
    des: filter
      ? `${filterLabel(filter)} — from ${params.bookTitle || 'this book'}. Each repeated question appears once.`
      : book
      ? `Questions from ${params.bookTitle || 'this book'}, gathered by chapter and basic science.`
      : 'Questions from every book in this bank, gathered by chapter and basic science.',
    uploader: 'Dr. Qusay Mohamed',
    img: '',
    source: book,
    name: params.name || '',
    number: 0,
  };
}

export async function loadQuizMeta(kind, id, params = {}) {
  // The saved copy is keyed by pkey, which for chapters and sets we can rebuild locally.
  if (kind === 'set') return setMeta(id, params);
  const offlineKey = kind === 'chapter' ? { kind, pkey: `${id}${params.type || ''}` } : null;
  if (!isOffline()) {
    try {
      return await withTimeout(fetchMeta(kind, id, params));
    } catch (e) {
      const saved = offlineKey && (await getQuiz(offlineKey));
      if (saved) return { ...saved.meta, ...params, offline: true };
      const anySaved = await findSavedByExamId(kind, id);
      if (anySaved) return { ...anySaved.meta, ...params, offline: true };
      throw e;
    }
  }
  const saved = offlineKey ? await getQuiz(offlineKey) : await findSavedByExamId(kind, id);
  if (saved) return { ...saved.meta, ...params, offline: true };
  throw new Error('You are offline and this quiz is not saved on your device.');
}

async function findSavedByExamId(kind, id) {
  const { listQuizzes } = await import('./offline');
  const rows = await listQuizzes();
  return rows.find((r) => r.kind === kind && r.id === id) || null;
}

// Every question of one book, kept for a few minutes so the practice screen's
// counts and the sets opened from it read the book only once.
const bookCache = new Map();
export async function loadBookQuestions(book) {
  const hit = bookCache.get(book);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.list;
  const list = (await getWhere('quizqq', 'source', book)).filter((q) => q.question !== undefined);
  list.sort((a, b) => (a._key < b._key ? -1 : a._key > b._key ? 1 : 0));
  bookCache.set(book, { at: Date.now(), list });
  return list;
}

/**
 * One question by id, or null when it is gone or locked: a linked question
 * from a book this person has not unlocked is refused by the database rules.
 */
export const getQuestion = (id) =>
  getOne(`quizqq/${id}`)
    .then((q) => q && { ...q, _key: id })
    .catch(() => null);

// Stored by the function as an array, which the database may hand back as an object.
const toKeys = (keys) => (Array.isArray(keys) ? keys : Object.values(keys || {})).map(String).filter(Boolean);

async function fetchQuestions(meta) {
  let list;
  if (meta.ai) {
    const rows = await Promise.all(meta.keys.map(getQuestion));
    return rows.filter((q) => q && q.question !== undefined);
  }
  if (meta.set) {
    // A set inside one book reads the book (a "source" query), which the
    // database's quiz lock lets through for anyone who unlocked that book,
    // its group or its bank; a chapter or section query needs the bank.
    list = meta.filter || meta.book
      ? await loadBookQuestions(meta.book)
      : meta.filterChapter
      ? await getWhere('quizqq', 'bchap', `${meta.bank}|${meta.filterChapter}`)
      : await getWhere('quizqq', 'bsci', `${meta.bank}|${meta.science}`);
    list = list.filter(
      (q) =>
        q.question !== undefined &&
        (!meta.filterChapter || q.chapter === meta.filterChapter) &&
        (!meta.science || q.science === meta.science) &&
        (!meta.book || q.source === meta.book),
    );
    // Keep each book's questions together, in their quiz order.
    list.sort((a, b) => String(a.source).localeCompare(String(b.source)) || (a._key < b._key ? -1 : a._key > b._key ? 1 : 0));
    // A recall question repeated in several sittings has a copy in each
    // (quizqq/<id>/same_as on the copies); a set needs it only once.
    if (!meta.filter) return batchOf(uniqueQuestions(list), meta.part);
    const history = parseFilter(meta.filter).answer && auth.currentUser ? await loadAllHistory(auth.currentUser.uid) : {};
    return batchOf(practiceFilter(list, meta.filter, history), meta.part);
  }
  if (meta.bysystem) {
    const [c1, c2] = await Promise.all([
      getWhere('quizqq', 'category1', meta.chapter),
      getWhere('quizqq', 'category2', meta.chapter),
    ]);
    const byKey = new Map();
    [...c1, ...c2].forEach((q) => byKey.set(q._key, q));
    list = [...byKey.values()].filter((q) => matchesChapter(q, meta.chapter, meta.type));
  } else {
    list = await getWhere('quizqq', 'key', meta.pkey);
    // A quiz can also link questions that live in another quiz (a recall
    // sitting that repeats an earlier question): allquiz/<id>/order maps every
    // question id, its own and linked ones, to its place in the quiz.
    const order = meta.raw?.order;
    if (order && typeof order === 'object') {
      const have = new Set(list.map((q) => q._key));
      const linked = await Promise.all(
        Object.keys(order)
          .filter((id) => !have.has(id))
          .map(getQuestion),
      );
      list = [...list, ...linked.filter(Boolean)];
      const at = (q) => (order[q._key] === undefined ? Infinity : num(order[q._key]));
      list = list.filter((q) => q.question !== undefined);
      list.sort((a, b) => at(a) - at(b) || (a._key < b._key ? -1 : a._key > b._key ? 1 : 0));
      return list;
    }
  }
  list = list.filter((q) => q.question !== undefined);
  list.sort((a, b) => (a._key < b._key ? -1 : a._key > b._key ? 1 : 0));
  return list;
}

export async function loadQuestions(meta, { fresh = false, manual = false } = {}) {
  const cacheKey = `${meta.kind}:${meta.pkey}`;
  // Sets built from your own answers change as you answer, so they are never served from the cache.
  const personal = meta.set && isPersonalFilter(meta.filter);
  if (!fresh && !manual && !personal && questionCache.has(cacheKey)) return questionCache.get(cacheKey);

  if (!isOffline()) {
    try {
      const list = await withTimeout(fetchQuestions(meta));
      questionCache.set(cacheKey, list);
      // Automatic offline copy of everything opened online.
      saveQuiz(meta, list, { manual }).catch(() => {});
      return list;
    } catch (e) {
      const saved = await getQuiz(meta);
      if (saved?.questions?.length) {
        questionCache.set(cacheKey, saved.questions);
        return saved.questions;
      }
      throw e;
    }
  }

  const saved = await getQuiz(meta);
  if (saved?.questions?.length) {
    questionCache.set(cacheKey, saved.questions);
    return saved.questions;
  }
  throw new Error('You are offline and this quiz is not saved on your device.');
}

/** "Download for offline": fetches fresh and keeps it permanently. */
export async function downloadQuiz(meta) {
  const list = await fetchQuestions(meta);
  questionCache.set(`${meta.kind}:${meta.pkey}`, list);
  return saveQuiz(meta, list, { manual: true });
}

export function invalidateQuestions(meta) {
  questionCache.delete(`${meta.kind}:${meta.pkey}`);
}

/** Leaderboard: quizlead users that have a score for this quiz, best first. */
export async function loadLeaderboard(pkey, limit = 50) {
  let list;
  try {
    list = toList(await get(query(ref(db, 'quizlead'), orderByChild(pkey), startAt(''))));
  } catch {
    list = toList(await get(ref(db, 'quizlead')));
  }
  return list
    .filter((u) => u[pkey] !== undefined)
    .map((u) => ({ uid: u._key, name: u.name, img: u.img, points: num(u[pkey]) }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

/**
 * A paused session for this quiz, or null.
 *
 * There are two places one can be: the `resume` node, written when the reader
 * taps "Save for later", and the bookmark on the device, written after every
 * answer so that an app killed mid-quiz still knows where it was. The database
 * copy wins, because it is the deliberate one and it also arrives on a second
 * device.
 */
export async function findSavedSession(uid, pkey) {
  if (!uid || !pkey) return null;
  const rows = (await getWhere('resume', 'uid', uid).catch(() => [])).filter((r) => r.key === pkey);
  if (rows.length) return rows[rows.length - 1];
  const local = loadSpot('quiz', pkey);
  return local ? { ...local, local: true } : null;
}

/**
 * Every quiz left half-finished, newest first, ready to be offered on the home
 * page. Each one carries the route that reopens it, because a pkey alone is not
 * enough to rebuild the URL of a chapter quiz.
 *
 * The deliberate "Save for later" records win over the device's own bookmarks:
 * they are the ones that also arrive on a second phone.
 */
export async function listPausedSessions(uid) {
  const out = new Map();
  listSpots()
    .filter((s) => s.kind === 'quiz' && s.path)
    .forEach((s) =>
      out.set(s.id, {
        pkey: s.id,
        title: s.title || 'Quiz',
        played: num(s.played),
        tq: num(s.tq),
        path: s.path,
        newPath: s.newPath,
        at: s.at || 0,
      }),
    );
  const rows = await getWhere('resume', 'uid', uid).catch(() => []);
  rows
    .filter((r) => r.path)
    .forEach((r) =>
      out.set(r.key, {
        pkey: r.key,
        title: r.title || out.get(r.key)?.title || 'Quiz',
        played: num(r.played),
        tq: num(r.tq),
        path: r.path,
        newPath: r.newPath,
        at: out.get(r.key)?.at || 0,
      }),
    );
  return [...out.values()].sort((a, b) => b.at - a.at);
}

/** Route helpers so every screen builds the same URLs. */
export function quizPath(kind, id, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return `/quiz/${kind}/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
}
export function playPath(kind, id, mode, params = {}) {
  const qs = new URLSearchParams(
    Object.entries({ ...params, mode }).filter(([, v]) => v),
  ).toString();
  return `/play/${kind}/${encodeURIComponent(id)}?${qs}`;
}

/** Where the answers of the last finished attempt can be gone over. */
export function reviewPath(kind, id, params = {}) {
  const { mode, resume, fresh, ...rest } = params;
  const qs = new URLSearchParams(Object.entries(rest).filter(([, v]) => v)).toString();
  return `/review/${kind}/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
}
