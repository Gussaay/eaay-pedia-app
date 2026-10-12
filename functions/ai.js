// AI study helper (Gemini) for Easy Pedia MCQs.
//
// A Gemini API key, like the FCM service account, must never ship inside the
// app: anyone could pull it out of an APK and run up the bill. So the key is a
// Firebase secret that only this function can read, and the app reaches Gemini
// only through this callable.
//
// It is admin-only on purpose: the account paying for the key decides who uses
// it. Admin = the same hard-coded emails as src/config.js, or the `admin`
// flag the User manager sets on quizusers/<uid>.
//
// One-time setup (from the project folder):
//   1. Get a key at https://aistudio.google.com/apikey (the free tier is fine)
//   2. firebase functions:secrets:set GEMINI_API_KEY
//   3. firebase deploy --only functions
//
// Tasks the app sends (`task` plus its fields):
//   explain   question             why the right answer is right, the rest wrong
//   chat      messages, context    a tutor conversation, optionally about a question/card
//   quiz      topic, count, level  new practice MCQs (JSON)
//   cards     topic, count         new flashcards (JSON)
//   mnemonic  topic                a memory aid
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getDatabase } from 'firebase-admin/database';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
// "-latest" follows Google's current Flash model, so a retired version never
// breaks the app. Pin one instead with GEMINI_MODEL=... in functions/.env
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

const ADMIN_EMAILS = ['gussaay@gmail.com', 'malazmuzamil55@gmail.com'];

const SYSTEM = [
  'You are a pediatrics tutor inside Easy Pedia MCQs, a study app for medical students,',
  'pediatric residents and specialists preparing for exams (MRCPCH, Sudan Medical',
  'Specialization Board and similar). Be accurate, concise and exam-focused. Use short',
  'paragraphs and bullet points; plain text with simple markdown (**bold**, "- " bullets)',
  'only. Name the guideline or classic source when a fact depends on one. If something is',
  'uncertain or guidelines differ, say so rather than guessing.',
].join(' ');

const clip = (s, n) => String(s ?? '').slice(0, n);

function questionText(q = {}) {
  const opts = ['a', 'b', 'c', 'd', 'e']
    .filter((k) => String(q[k] || '').trim())
    .map((k) => `${k.toUpperCase()}. ${clip(q[k], 600)}`)
    .join('\n');
  const answer = String(q.answer || '').trim().toLowerCase();
  return [
    `Question: ${clip(q.question, 3000)}`,
    opts,
    answer ? `Answer key: ${answer.toUpperCase()}` : '',
    q.exp ? `Explanation in the bank: ${clip(q.exp, 3000)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function contextText(ctx) {
  if (!ctx) return '';
  if (ctx.kind === 'question') return `The student is looking at this MCQ:\n${questionText(ctx.question)}`;
  if (ctx.kind === 'card') return `The student is looking at this flashcard:\nFront: ${clip(ctx.front, 1500)}\nBack: ${clip(ctx.back, 3000)}`;
  if (ctx.kind === 'text') return `Topic: ${clip(ctx.text, 3000)}`;
  return '';
}

const MCQ_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      question: { type: 'STRING' },
      a: { type: 'STRING' },
      b: { type: 'STRING' },
      c: { type: 'STRING' },
      d: { type: 'STRING' },
      e: { type: 'STRING' },
      answer: { type: 'STRING', enum: ['a', 'b', 'c', 'd', 'e'] },
      exp: { type: 'STRING' },
    },
    required: ['question', 'a', 'b', 'c', 'd', 'answer', 'exp'],
  },
};

const CARD_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      front: { type: 'STRING' },
      back: { type: 'STRING' },
      hint: { type: 'STRING' },
    },
    required: ['front', 'back'],
  },
};

const count = (n, def, max) => Math.max(1, Math.min(max, parseInt(n, 10) || def));

/** Turns a request into Gemini `contents` (+ JSON schema for structured tasks). */
function buildRequest(data) {
  const task = String(data?.task || '');
  const user = (text) => [{ role: 'user', parts: [{ text }] }];

  if (task === 'explain') {
    if (!data.question?.question) throw new HttpsError('invalid-argument', 'No question to explain.');
    return {
      contents: user(
        `${questionText(data.question)}\n\nExplain this MCQ for exam revision: why the keyed answer is ` +
          'correct, then one line on why each other option is wrong. End with a short "Key point" line ' +
          'worth memorising. If you believe the answer key is wrong, say so clearly and why.',
      ),
    };
  }

  if (task === 'chat') {
    const msgs = (Array.isArray(data.messages) ? data.messages : [])
      .slice(-20)
      .map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: clip(m.text, 4000) }] }))
      .filter((m) => m.parts[0].text.trim());
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') {
      throw new HttpsError('invalid-argument', 'Nothing to answer.');
    }
    const ctx = contextText(data.context);
    if (ctx) msgs.unshift({ role: 'user', parts: [{ text: ctx }] }, { role: 'model', parts: [{ text: 'Understood.' }] });
    return { contents: msgs };
  }

  const topic = clip(data.topic, 2000).trim();
  if (!topic) throw new HttpsError('invalid-argument', 'Enter a topic.');

  if (task === 'quiz') {
    const n = count(data.count, 5, 20);
    const level = clip(data.level, 60) || 'pediatric resident';
    return {
      contents: user(
        `Write ${n} single-best-answer MCQs on: ${topic}\nLevel: ${level}. Clinical vignettes where ` +
          'sensible, five options (a-e), one clearly best answer, answers spread across letters. ' +
          '"exp" explains why the answer is right and the main distractors wrong in 2-4 sentences.',
      ),
      schema: MCQ_SCHEMA,
    };
  }

  if (task === 'cards') {
    const n = count(data.count, 10, 40);
    return {
      contents: user(
        `Write ${n} flashcards for spaced-repetition revision on: ${topic}\nOne fact per card. ` +
          '"front" is a short question or cue, "back" the answer in at most 2 sentences or a short list. ' +
          '"hint" is optional and short.',
      ),
      schema: CARD_SCHEMA,
    };
  }

  if (task === 'mnemonic') {
    return {
      contents: user(
        `Make a memorable mnemonic for: ${topic}\nIf a well-known mnemonic already exists, give it first. ` +
          'Show the mnemonic, then each letter/word with what it stands for, then one line on how to ' +
          'picture it so it sticks.',
      ),
    };
  }

  throw new HttpsError('invalid-argument', `Unknown task "${task}".`);
}

async function isAdmin(auth) {
  const email = String(auth?.token?.email || '').toLowerCase();
  if (ADMIN_EMAILS.includes(email)) return true;
  const snap = await getDatabase().ref(`quizusers/${auth.uid}/admin`).get();
  return snap.val() === 'true' || snap.val() === true;
}

export const aiStudy = onCall(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 120, memory: '256MiB', maxInstances: 3 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    if (!(await isAdmin(request.auth))) {
      throw new HttpsError('permission-denied', 'The AI study helper is only available to admins.');
    }
    const key = GEMINI_API_KEY.value();
    if (!key) throw new HttpsError('failed-precondition', 'GEMINI_API_KEY is not set on the server.');

    const { contents, schema } = buildRequest(request.data);
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents,
      generationConfig: {
        temperature: schema ? 0.6 : 0.4,
        maxOutputTokens: 8192,
        ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
      },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      logger.warn(`Gemini ${res.status}: ${msg}`);
      if (res.status === 429) throw new HttpsError('resource-exhausted', 'Gemini rate limit reached, try again in a minute.');
      throw new HttpsError('internal', `Gemini error: ${clip(msg, 300)}`);
    }

    const cand = json?.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (!text) {
      const why = cand?.finishReason || json?.promptFeedback?.blockReason || 'empty reply';
      throw new HttpsError('internal', `Gemini returned no answer (${why}).`);
    }

    if (!schema) return { text, model: MODEL };
    try {
      return { items: JSON.parse(text), model: MODEL };
    } catch {
      throw new HttpsError('internal', 'Gemini returned malformed JSON, try again.');
    }
  },
);
