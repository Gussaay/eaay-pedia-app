// Loads a quiz (metadata + questions) for the two kinds the Android app had:
//  - "exam":    an allquiz/<childKey> record; questions are quizqq where key == allquiz.key
//  - "chapter": a chapters/<chapterKey> record played "by system"; questions are
//               quizqq where category1/category2 == chapter name and type == sub-type.
import { get, query, ref, orderByChild, startAt } from 'firebase/database';
import { db } from '../firebase';
import { getOne, getWhere, toList, num } from './rtdb';
import { matchesChapter } from './quiz';

const questionCache = new Map();

export async function loadQuizMeta(kind, id, params = {}) {
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

export async function loadQuestions(meta, { fresh = false } = {}) {
  const cacheKey = `${meta.kind}:${meta.pkey}`;
  if (!fresh && questionCache.has(cacheKey)) return questionCache.get(cacheKey);

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
  questionCache.set(cacheKey, list);
  return list;
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
