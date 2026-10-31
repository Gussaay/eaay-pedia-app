// The pick and the writes for the morning "Question of the day" (daily.js).
// No imports, so src/lib/dailyPick.test.js can check it against
// src/lib/dailyPick.js without installing the functions' packages.

const OPTION_KEYS = ['a', 'b', 'c', 'd', 'e'];
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

const visibleOptions = (q) =>
  OPTION_KEYS.filter((k) => q?.[k] !== undefined && q?.[k] !== null && String(q[k]).trim() !== '');

/** The day in Sudan (UTC+2), yyyy-mm-dd: everyone shares one question per day. */
export const sudanDay = (now = Date.now()) => new Date(now + 2 * 3600 * 1000).toISOString().slice(0, 10);

export function pushKeyTime(key) {
  let t = 0;
  for (const ch of String(key || '').slice(0, 8)) {
    const i = PUSH_CHARS.indexOf(ch);
    if (i < 0) return 0;
    t = t * 64 + i;
  }
  return t;
}

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

export function seeded(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function usableQuestion(q) {
  if (!q || !String(q.question || '').trim()) return false;
  const options = visibleOptions(q);
  const answer = String(q.answer || '').trim().toLowerCase();
  return options.length >= 2 && options.includes(answer);
}

export function pickDaily(entries, day) {
  const usable = entries.filter(([, q]) => usableQuestion(q));
  const explained = usable.filter(([, q]) => String(q.exp || '').trim() || q.exp_img);
  const pool = (explained.length ? explained : usable).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (!pool.length) return null;
  return pool[Math.floor(seeded(`daily:${day}`) * pool.length)];
}

export function dailyPush(q, createdAt) {
  const stem = String(q.question || '').replace(/\s+/g, ' ').trim();
  return {
    title: '🩺 Question of the day',
    body: stem.length > 110 ? `${stem.slice(0, 107).trimEnd()}…` : stem,
    url: '/?daily=1',
    target: 'all',
    level: '',
    uid: '',
    status: 'pending',
    createdAt,
  };
}

export function dailyRecord(id, q, day) {
  const out = { question: String(q.question), answer: String(q.answer).trim().toLowerCase(), auto: '1', day, qid: id };
  for (const k of [...visibleOptions(q), 'exp', 'question_img', 'exp_img']) if (q[k]) out[k] = String(q[k]);
  return out;
}

/** Posts and/or sends today's question. Returns what it did, for the log. */
export async function runDaily(db, now = Date.now()) {
  const today = sudanDay(now);
  const notify = (dailyKey, q) => ({
    [`dailyquizz/${dailyKey}/notified`]: '1',
    [`push_outbox/${newPushKey(now)}`]: dailyPush(q, now),
  });

  const latest = (await db.ref('dailyquizz').orderByKey().limitToLast(1).get()).val() || {};
  const [lastKey, last] = Object.entries(latest)[0] || [];
  if (lastKey && (last?.day === today || sudanDay(pushKeyTime(lastKey)) === today)) {
    if (last?.notified === '1') return `${today}: ${lastKey} already posted and sent`;
    await db.ref().update(notify(lastKey, last));
    return `${today}: ${lastKey} was posted; sent its notification`;
  }

  // Questions of preview quizzes are not counted on the main page either.
  const quizzes = (await db.ref('allquiz').get()).val() || {};
  const preview = new Set(Object.values(quizzes).filter((q) => q && String(q.preview) === 'true').map((q) => q.key));
  const entries = Object.entries((await db.ref('quizqq').get()).val() || {}).filter(([, q]) => q && !preview.has(q.key));
  const pick = pickDaily(entries, today);
  if (!pick) throw new Error(`${today}: no usable question in ${entries.length}`);
  const [id, q] = pick;
  const dailyKey = newPushKey(now);
  // One write for the question and its notification, so it is never posted
  // without its push or pushed twice. `notified` goes inside the record: the
  // database refuses an update holding both a path and a path under it.
  await db.ref().update({
    [`dailyquizz/${dailyKey}`]: { ...dailyRecord(id, q, today), notified: '1' },
    [`push_outbox/${newPushKey(now)}`]: dailyPush(q, now),
  });
  return `${today}: picked ${id} from ${entries.length}; posted and sent`;
}
