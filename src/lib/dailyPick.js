// The automatic "Question of the day": when no daily question was posted for
// today, scripts/daily-question.mjs posts one picked from the bank. The pick
// depends only on the date, so a re-run on the same day posts the same one.
import { visibleOptions } from './quiz.js';

/** The day in Sudan (UTC+2), yyyy-mm-dd: everyone shares one question per day. */
export function sudanDay(now = Date.now()) {
  return new Date(now + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

/** When a Firebase push key was made (its first 8 characters are the time). */
export function pushKeyTime(key) {
  let t = 0;
  for (const ch of String(key || '').slice(0, 8)) {
    const i = PUSH_CHARS.indexOf(ch);
    if (i < 0) return 0;
    t = t * 64 + i;
  }
  return t;
}

/** A new Firebase-style push key for time `now` (sorts after older keys). */
export function newPushKey(now = Date.now(), random = Math.random) {
  let t = now;
  let head = '';
  for (let i = 0; i < 8; i += 1) {
    head = PUSH_CHARS[t % 64] + head;
    t = Math.floor(t / 64);
  }
  let tail = '';
  for (let i = 0; i < 12; i += 1) tail += PUSH_CHARS[Math.floor(random() * 64)];
  return head + tail;
}

/** A number from 0 to 1 that only depends on the text (FNV-1a, then mixed). */
export function seeded(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A question can be the daily one when it has a stem, 2+ options and an answer among them. */
export function usableQuestion(q) {
  if (!q || !String(q.question || '').trim()) return false;
  const options = visibleOptions(q);
  const answer = String(q.answer || '').trim().toLowerCase();
  return options.length >= 2 && options.includes(answer);
}

/**
 * Today's question from every question in the bank, as [id, question] pairs.
 * Questions with an explanation are preferred; ties are broken by id order so
 * the result does not depend on how the database listed them.
 */
export function pickDaily(entries, day) {
  const usable = entries.filter(([, q]) => usableQuestion(q));
  const explained = usable.filter(([, q]) => String(q.exp || '').trim() || q.exp_img);
  const pool = (explained.length ? explained : usable).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (!pool.length) return null;
  return pool[Math.floor(seeded(`daily:${day}`) * pool.length)];
}

/** The push notification for a daily question: the stem's first words as the body. */
export function dailyPush(q, createdAt) {
  const stem = String(q.question || '').replace(/\s+/g, ' ').trim();
  return {
    title: '🩺 Question of the day',
    body: stem.length > 110 ? `${stem.slice(0, 107).trimEnd()}…` : stem,
    // Opens the app on the home page with the question already open.
    url: '/?daily=1',
    target: 'all',
    level: '',
    uid: '',
    status: 'pending',
    createdAt,
  };
}

/** The dailyquizz record the app reads (components/DailyQuiz.jsx). */
export function dailyRecord(id, q, day) {
  const out = { question: String(q.question), answer: String(q.answer).trim().toLowerCase(), auto: '1', day, qid: id };
  for (const k of [...visibleOptions(q), 'exp', 'question_img', 'exp_img']) if (q[k]) out[k] = String(q[k]);
  return out;
}
