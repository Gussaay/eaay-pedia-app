// Loads a quiz (metadata + questions) for the two kinds the Android app had:
//  - "exam":    an allquiz/<childKey> record; questions are quizqq where key == allquiz.key
//  - "chapter": a chapters/<chapterKey> record played "by system"; questions are
//               quizqq where category1/category2 == chapter name and type == sub-type.
//
// Everything opened online is also saved for offline play (src/lib/offline.js),
// and reads fall back to that copy when the device has no connection.
import { get, query, ref, orderByChild, startAt } from 'firebase/database';
import { db } from '../firebase';
import { getOne, getWhere, toList, num } from './rtdb';
import { matchesChapter } from './quiz';
import { getQuiz, saveQuiz } from './offline';

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

export async function loadQuizMeta(kind, id, params = {}) {
  // The saved copy is keyed by pkey, which for chapters we can rebuild locally.
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

async function fetchQuestions(meta) {
  let list;
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
  }
  list = list.filter((q) => q.question !== undefined);
  list.sort((a, b) => (a._key < b._key ? -1 : a._key > b._key ? 1 : 0));
  return list;
}

export async function loadQuestions(meta, { fresh = false, manual = false } = {}) {
  const cacheKey = `${meta.kind}:${meta.pkey}`;
  if (!fresh && !manual && questionCache.has(cacheKey)) return questionCache.get(cacheKey);

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
