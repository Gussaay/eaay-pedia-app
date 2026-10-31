// What the AI study helper shares between people, and what it learns from them.
//
//   aiShared/explain/<questionId>/<mode>  one saved "Explain with AI" answer per
//       question, for everyone: { fp, text, model, sources?, at, by, up, down }.
//       <mode> is "bank" (plain) or "books" (from the textbooks). `fp` is the
//       question's fingerprint, so editing the question retires the answer.
//       The first person to ask pays one request; everyone after gets it free.
//       An answer voted down (two more 👎 than 👍) is no longer handed out, and
//       the next person to ask gets a new one, which replaces it.
//   aiUsage/log/<day>/<id>/vote   1 or -1 from the person who used it (👍/👎).
//
//       `v` is the prompt version (EXPLAIN_VERSION): older answers are asked again.
//
// Also gathers the bank's own linked questions for an explanation, so the AI
// explains in step with the bank's answer keys and teaching and sums up what
// they say (functions/explainPrompt.js).
import { getDatabase } from 'firebase-admin/database';
import { HttpsError } from 'firebase-functions/v2/https';
import { EXPLAIN_VERSION, linkedBlock, pickLinks } from './explainPrompt.js';

const SAFE_KEY = /^[^/.#$[\]]{1,200}$/;
export const validKey = (k) => (typeof k === 'string' && SAFE_KEY.test(k) ? k : '');

const str = (v) => String(v ?? '').trim();

/** Same as the app's questionFingerprint (src/lib/aiFormat.js). */
export function questionFingerprint(q) {
  const text = [q?.question, q?.a, q?.b, q?.c, q?.d, q?.e, q?.answer].map(str).join('\u0001');
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export const explainMode = (data) => (data?.books ? 'books' : 'bank');
const sharedRef = (qid, mode) => getDatabase().ref(`aiShared/explain/${qid}/${mode}`);

/** A voted-down answer is not handed out again. */
export const isTrusted = (hit) => (Number(hit?.down) || 0) - (Number(hit?.up) || 0) < 2;

/** The saved answer for this question, if it still fits it. */
export async function sharedExplanation(qid, data) {
  if (!qid || !data?.question) return null;
  const hit = (await sharedRef(qid, explainMode(data)).get()).val();
  if (!hit?.text || hit.fp !== questionFingerprint(data.question) || !isTrusted(hit)) return null;
  // Written by an older prompt (before linked-question summaries): ask again.
  if ((Number(hit.v) || 1) < EXPLAIN_VERSION) return null;
  return hit;
}

/**
 * Saves a new answer for everyone, unless a trusted one is already there and
 * this was a personal "New explanation" by someone who is not staff.
 */
export async function saveExplanation(qid, data, out, { uid, staff }) {
  if (!qid || !out?.text) return;
  const ref = sharedRef(qid, explainMode(data));
  const old = (await ref.get()).val();
  const fits = old?.fp === questionFingerprint(data.question) && isTrusted(old) && (Number(old.v) || 1) >= EXPLAIN_VERSION;
  if (fits && data.fresh && !staff) return;
  await ref.set({
    fp: questionFingerprint(data.question),
    v: EXPLAIN_VERSION,
    text: out.text,
    model: out.model || '',
    ...(out.sources ? { sources: out.sources } : {}),
    at: Date.now(),
    by: uid,
    up: 0,
    down: 0,
  });
}

/**
 * The bank's questions linked to this one (similar first, then linked; its own
 * copies in other sittings add nothing), each with its stem, options, key and
 * explanation, capped for length: { text, shown } for explainPrompt.
 */
export async function linkedQuestions(qid) {
  if (!qid) return { text: '', shown: 0 };
  const db = getDatabase();
  const me = (await db.ref(`quizqq/${qid}`).get()).val();
  const { pick, total } = pickLinks(me, qid, { ok: validKey });
  if (!pick.length) return { text: '', shown: 0 };
  const rows = await Promise.all(pick.map(({ kind, id }) => db.ref(`quizqq/${id}`).get().then((s) => ({ kind, q: s.val() }))));
  return linkedBlock(rows, total);
}

/** 👍 / 👎 on a logged use, by the person who made it. */
export async function vote(uid, data) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(data?.day)) ? data.day : '';
  const logId = validKey(data?.logId);
  const v = Number(data?.vote) === 1 ? 1 : Number(data?.vote) === -1 ? -1 : 0;
  if (!day || !logId) throw new HttpsError('invalid-argument', 'Nothing to rate.');
  const db = getDatabase();
  const lineRef = db.ref(`aiUsage/log/${day}/${logId}`);
  const line = (await lineRef.get()).val();
  if (!line || line.uid !== uid) throw new HttpsError('permission-denied', 'You can only rate your own answers.');
  const before = Number(line.vote) || 0;
  if (before === v) return { vote: v };
  await lineRef.child('vote').set(v || null);
  // A shared explanation keeps the votes of everyone it was handed to.
  if (line.task === 'explain' && validKey(line.qid)) {
    await db.ref(`aiShared/explain/${line.qid}/${line.mode === 'books' ? 'books' : 'bank'}`).transaction((s) => {
      if (!s) return s;
      if (before === 1) s.up = Math.max(0, (Number(s.up) || 0) - 1);
      if (before === -1) s.down = Math.max(0, (Number(s.down) || 0) - 1);
      if (v === 1) s.up = (Number(s.up) || 0) + 1;
      if (v === -1) s.down = (Number(s.down) || 0) + 1;
      return s;
    });
  }
  return { vote: v };
}
