// Keeps ospe/cards (the OSPE image flashcards) up to date by itself.
//
// Whenever a picture is set on a question (explanation or question image) or on
// a flashcard (front or back image), the picture gets a card under
// ospe/cards/<ospeId(url)> with that place as one of its sources. One picture is
// one card, so the same image used in ten questions is one card with ten
// sources. A brand-new card is captioned by Groq from the question's own text
// (status 'auto'); when the text does not say what the picture is, or Groq
// fails, the card stays 'waiting' for an admin. When a picture is changed or
// removed the old card loses that source (and hides itself if none are left).
//
// Mnemonic flashcards are skipped: their pictures are drawings for the
// Mnemonics section, not identification cards.
import { onValueWritten } from 'firebase-functions/v2/database';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getDatabase } from 'firebase-admin/database';
import { captionPrompt, mergeSource, parseCaptionReply, questionSourceLabel, removeSource, srcKey } from './ospeCore.js';
import { ospeId } from './ospeId.js';
import { GROQ_MODELS } from './ai.js';

const GROQ_API_KEY = defineSecret('GROQ_API_KEY');
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const db = () => getDatabase();
const read = async (path) => (await db().ref(path).get()).val();
const isUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim());
const cardRef = (id) => db().ref(`ospe/cards/${id}`);

/** Asks Groq what the picture is; null when it fails (the card then waits for an admin). */
async function askGroq({ system, user }) {
  const key = String(GROQ_API_KEY.value() || '').replace(/[\s"']/g, '');
  if (!key) return null;
  for (const model of GROQ_MODELS) {
    try {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.1,
          reasoning_effort: 'low',
          include_reasoning: false,
          response_format: { type: 'json_object' },
        }),
      });
      if (!r.ok) {
        logger.warn(`Groq ${model} ${r.status}`);
        continue;
      }
      const j = await r.json().catch(() => ({}));
      const parsed = parseCaptionReply(j?.choices?.[0]?.message?.content || '');
      if (parsed) return parsed;
    } catch (e) {
      logger.warn(`Groq ${model}: ${e.message}`);
    }
  }
  return null;
}

/** Everything needed to label a question's source and caption its picture. */
async function questionInfo(qid, field) {
  const q = await read(`quizqq/${qid}`);
  if (!q) return null;
  const [quiz, books, banks] = await Promise.all([
    q.key ? read(`allquiz/${q.key}`) : null,
    read('mcqs'),
    read('main_category'),
  ]);
  const book = Object.values(books || {}).find((b) => b && b.source === q.source) || null;
  const bank = book ? Object.values(banks || {}).find((c) => c && c.source === book.main_category) : null;
  const group = String(book?.group || '').trim();
  const n = q.n ?? q.number ?? q.no ?? q.order;
  const quizTitle = quiz?.title || q.title || q.quiztitle || '';
  const label = questionSourceLabel({
    bank: bank?.title || book?.main_category,
    group: group && (bank?.groups?.[group]?.title || group),
    book: book?.title,
    quiz: quizTitle,
    n,
  });
  return {
    src: { type: 'q', qid, quiz: q.key || '', ...(n !== undefined && n !== null ? { n } : {}), label },
    prompt: { stem: q.question, answer: q[q.answer], explanation: q.exp, field },
    chapter: q.chapter || '',
    topic: q.topic || '',
    topic_label: q.tags?.[q.topic] || '',
  };
}

/** The same for a flashcard; null for a mnemonic card (not an OSPE picture). */
async function flashInfo(deck, card, field) {
  const c = await read(`flashcard_items/${deck}/${card}`);
  if (!c || c.visual) return null;
  const d = await read(`flashdecks/${deck}`);
  const [books, cats] = await Promise.all([read('flashbooks'), read('flashcategory')]);
  const book = Object.values(books || {}).find((b) => b && b.source === d?.source) || null;
  const cat = book ? Object.values(cats || {}).find((x) => x && x.source === book.main_category) : null;
  if (d?.kind === 'mnemonic' || cat?.kind === 'mnemonic') return null;
  const label = ['Flashcards', book?.title, d?.title].map((t) => String(t || '').trim()).filter(Boolean).join(' › ');
  return {
    src: { type: 'card', deck, card, label },
    prompt: { stem: c.front, answer: c.back, explanation: '', field },
    chapter: c.chapter || '',
    topic: '',
    topic_label: '',
  };
}

async function drop(url, src) {
  const id = ospeId(url);
  if (!id) return;
  const key = srcKey(src);
  await cardRef(id).transaction((card) => (card && card.sources?.[key] ? removeSource(card, key, Date.now()) : card));
}

async function add(url, field, load) {
  const id = ospeId(url);
  if (!id) return;
  const exists = (await cardRef(id).get()).exists();
  const info = await load();
  if (!info) return;
  const base = { src: info.src, img: url.trim(), field, chapter: info.chapter, topic: info.topic, topic_label: info.topic_label };

  let ai = null;
  if (!exists) ai = await askGroq(captionPrompt(info.prompt));

  await cardRef(id).transaction((card) => {
    const merged = mergeSource(card, { ...base, now: Date.now() });
    // Fill the label only on a card that has none yet (never overwrite a title).
    if (ai?.ok && !merged.title && !merged.caption && merged.status === 'waiting') {
      return { ...merged, title: ai.title, caption: ai.caption, kind: ai.kind, status: 'auto' };
    }
    return merged;
  });
}

/** Handles one picture field being written. */
async function handle(event, field, srcOf, load) {
  const before = event.data.before.val();
  const after = event.data.after.val();
  const src = srcOf(event.params);
  if (isUrl(before) && before !== after) await drop(before, src);
  if (isUrl(after)) await add(after, field, () => load(event.params));
}

const opts = (ref) => ({ ref, retry: false, memory: '256MiB', secrets: [GROQ_API_KEY] });
const qSrc = (p) => ({ type: 'q', qid: p.qid });
const cSrc = (p) => ({ type: 'card', deck: p.deck, card: p.card });

export const ospeQuestionExpImg = onValueWritten(opts('/quizqq/{qid}/exp_img'), (e) =>
  handle(e, 'exp_img', qSrc, (p) => questionInfo(p.qid, 'exp_img')),
);
export const ospeQuestionImg = onValueWritten(opts('/quizqq/{qid}/question_img'), (e) =>
  handle(e, 'question_img', qSrc, (p) => questionInfo(p.qid, 'question_img')),
);
export const ospeFlashImg = onValueWritten(opts('/flashcard_items/{deck}/{card}/img'), (e) =>
  handle(e, 'img', cSrc, (p) => flashInfo(p.deck, p.card, 'img')),
);
export const ospeFlashBackImg = onValueWritten(opts('/flashcard_items/{deck}/{card}/back_img'), (e) =>
  handle(e, 'back_img', cSrc, (p) => flashInfo(p.deck, p.card, 'back_img')),
);
