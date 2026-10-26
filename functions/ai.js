// AI study helper for Easy Pedia MCQs: Groq (GPT-OSS) first, Gemini as backup.
//
// An API key, like the FCM service account, must never ship inside the app:
// anyone could pull it out of an APK and run up the bill. So the keys are
// Firebase secrets that only this function can read, and the app reaches the
// AI only through this callable.
//
// Everyone signed in may use it, up to a daily allowance worked out from the
// free tiers' limits and how many people use the AI (aiQuota.js). Staff (the
// hard-coded emails of src/config.js, the `admin` flag the User manager sets on
// quizusers/<uid>, or a superuser/manager/editor role in access/<uid>) have no
// allowance of their own, only the shared pool.
//
// One-time setup (from the project folder):
//   1. Get a key at https://console.groq.com/keys (the free tier is fine)
//   2. firebase functions:secrets:set GROQ_API_KEY
//   3. Optional backup: a key from https://aistudio.google.com/apikey, then
//      firebase functions:secrets:set GEMINI_API_KEY
//   4. firebase deploy --only functions
//
// Tasks the app sends (`task` plus its fields):
//   explain   question             why the right answer is right, the rest wrong
//   chat      messages, context    a tutor conversation, optionally about a question/card
//   quiz      topic, count, level  new practice MCQs (JSON)
//   cards     topic, count         new flashcards (JSON)
//   mnemonic  topic                a memory aid
//   agent     messages             the tutor with tools (agent.js): searches the
//                                  bank and textbooks, builds quizzes, asks back
//   quota     -                    the caller's allowance today, without asking the AI
//   vote      logId, day, vote     👍 (1) / 👎 (-1) on one of the caller's answers
// `explain` may add `qid` (the question's id): the answer is then shared with
// everyone who asks about the same question (aiShared.js) and draws on the
// bank's linked questions; `fresh: true` asks for a new one.
// Every reply carries `quota` too, so the app shows what is left.
// `explain` and `chat` may add `books: true` to answer from the indexed
// textbooks (books.js); the reply then carries `sources`.
// Any task may add `provider: 'groq' | 'gemini'` to ask that one only (the
// app's Compare button); without it Groq answers and Gemini is the backup.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getDatabase } from 'firebase-admin/database';
import { findPassages } from './books.js';
import { runAgent } from './agent.js';
import { activeUsers, dailyPool, modelKey, quotaConfig, userQuota } from './aiQuota.js';
import { linkedQuestions, saveExplanation, sharedExplanation, validKey, vote } from './aiShared.js';

const GROQ_API_KEY = defineSecret('GROQ_API_KEY');
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
// Groq's free tier gives each model its own daily allowance (1,000 requests
// and 200K tokens a day for GPT-OSS), so the smaller model takes over when the
// big one runs out, and Gemini after both. Pin one with GROQ_MODEL=... in
// functions/.env
const GROQ_MODELS = process.env.GROQ_MODEL
  ? [process.env.GROQ_MODEL]
  : ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// "-latest" follows Google's current Flash model, so a retired version never
// breaks the app. The free tier caps each model separately (as low as 20
// requests a day), so when one model's quota runs out or it is closed to the
// key, the next one is tried. Pin a single model with GEMINI_MODEL=... in
// functions/.env
const MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

const ADMIN_EMAILS = ['gussaay@gmail.com', 'malazmuzamil55@gmail.com'];

const SYSTEM = [
  'You are a pediatrics tutor inside Easy Pedia MCQs, a study app for medical students,',
  'pediatric residents and specialists preparing for exams (MRCPCH, Sudan Medical',
  'Specialization Board and similar). Be accurate, concise and exam-focused. Use short',
  'paragraphs and bullet points; plain text with simple markdown (**bold**, "- " bullets)',
  'only. Name the guideline or classic source when a fact depends on one. If something is',
  'uncertain or guidelines differ, say so rather than guessing. Write formulas and',
  'chemistry as plain text (NaHCO3, Ca2+), never LaTeX.',
].join(' ');

// Flash models "think" before answering, which made a one-paragraph reply take
// 30-90 s. Tutoring needs little of it: 2.5 models turn it off with a budget of
// 0, newer ones (behind the -latest aliases) take a level instead. A model that
// rejects the setting is asked again without it.
const thinkingFor = (model) =>
  /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' };

// Gemini's SSE stream: each `data:` line is a partial GenerateContentResponse.
// Text is handed to `onText` as it arrives and also returned merged, in the
// shape generateContent gives, so the rest of the handler is the same.
async function readSse(res, onText) {
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let last = {};
  const take = (line) => {
    if (!line.startsWith('data:')) return;
    let j;
    try {
      j = JSON.parse(line.slice(5));
    } catch {
      return;
    }
    last = j;
    const piece = (j?.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    if (piece) {
      text += piece;
      onText(piece);
    }
  };
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    lines.forEach(take);
  }
  take(buf);
  return {
    ...last,
    candidates: [{ ...last?.candidates?.[0], content: { parts: [{ text }] } }],
  };
}

// Groq's (OpenAI-style) SSE stream: each `data:` line carries a delta, the
// last one is `data: [DONE]`. Returns the whole text.
async function readChatSse(res, onText) {
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let tokens = 0;
  const take = (line) => {
    if (!line.startsWith('data:') || line.includes('[DONE]')) return;
    let j;
    try {
      j = JSON.parse(line.slice(5));
    } catch {
      return;
    }
    // Groq puts the token count on the last chunk.
    tokens = Number((j?.x_groq?.usage || j?.usage)?.total_tokens) || tokens;
    const piece = j?.choices?.[0]?.delta?.content || '';
    if (piece) {
      text += piece;
      onText(piece);
    }
  };
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    lines.forEach(take);
  }
  take(buf);
  return { text, tokens };
}

/** Gemini `contents` as chat-completions `messages`. */
const toMessages = (contents) => [
  { role: 'system', content: SYSTEM },
  ...contents.map((c) => ({
    role: c.role === 'model' ? 'assistant' : 'user',
    content: c.parts.map((p) => p.text).join(''),
  })),
];

/** A Gemini schema (type: 'STRING' …) as JSON Schema (type: 'string' …). */
function toJsonSchema(s) {
  const out = { ...s, type: s.type.toLowerCase() };
  if (s.items) out.items = toJsonSchema(s.items);
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toJsonSchema(v)]));
    out.additionalProperties = false;
  }
  return out;
}

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

/** What to look up in the books for this request: the question being asked. */
function bookQuery(data) {
  if (data.task === 'explain') return questionText({ ...data.question, exp: '' });
  const last = [...(data.messages || [])].reverse().find((m) => m.role !== 'model');
  const ctx = data.context?.kind === 'question' ? clip(data.context.question?.question, 1000) : '';
  return [clip(last?.text, 1500), ctx].filter(Boolean).join('\n');
}

/** Puts the passages in front of the last user turn, with how to use them. */
function withPassages(contents, passages) {
  const block = passages
    .map((p) => `[${p.n}] ${p.title}, p. ${p.page}:\n${p.text}`)
    .join('\n\n');
  const intro =
    `Passages from the student's own textbooks:\n\n${block}\n\n` +
    'Answer from these passages where they cover the question, and cite them inline as [1], [2]. ' +
    'If they do not cover it, say "Not in your textbooks" and answer from general knowledge. ' +
    'Never cite a passage for something it does not say.\n\n';
  const out = contents.map((c) => ({ ...c, parts: c.parts.map((p) => ({ ...p })) }));
  const last = out[out.length - 1];
  last.parts[0].text = intro + last.parts[0].text;
  return out;
}

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

// ------------------------------------------------------------------ usage
// Google never tells a caller how much quota is left, so the app keeps its own
// count: aiUsage/days/<date>/<model>/{used, tokens} per successful request, and
// the daily limit a 429 reports ("limit: 20, model: gemini-3.8-flash") under
// aiUsage/limits/<model>. Each person's requests are counted under
// aiUsage/users/<date>/<uid>, and the last day they used the AI under
// aiUsage/active/<uid>. Free-tier days end at midnight Pacific time.
const usageDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

async function recordUsage(fn) {
  try {
    await fn(getDatabase().ref('aiUsage'));
  } catch (e) {
    logger.warn(`Could not record AI usage: ${e.message}`); // never fail a reply over a counter
  }
}

/** One request that `model` answered, with its tokens, on `uid`'s account. */
const countRequest = (model, tokens = 0, uid = '') =>
  recordUsage((root) => {
    const day = usageDay();
    const key = modelKey(model);
    return Promise.all([
      root.child(`days/${day}/${key}/used`).transaction((n) => (Number(n) || 0) + 1),
      tokens > 0 && root.child(`days/${day}/${key}/tokens`).transaction((n) => (Number(n) || 0) + tokens),
      uid && root.child(`users/${day}/${uid}`).transaction((n) => (Number(n) || 0) + 1),
    ]);
  });

// A Gemini model that is not open to the key (404) adds nothing to
// today's pool.
const recordOff = (model) => recordUsage((root) => root.child(`off/${modelKey(model)}`).set(usageDay()));

// Groq says its limit on every reply, so the meter knows it from the start.
// The token cap (200K a day) can still run out before the request count.
const recordLimit = (model, limit) =>
  limit > 0 && recordUsage((root) => root.child(`limits/${modelKey(model)}`).set(limit));

const recordReset = (model, waitSeconds) =>
  recordUsage((root) => root.child(`days/${usageDay()}/${modelKey(model)}/resetAt`).set(Date.now() + waitSeconds * 1000));

// Recorded under the model Google names and under the name asked for (a
// "-latest" alias), which is the one the daily pool counts.
const recordQuotaHit = (message, waitSeconds, asked) => {
  const m = /limit:\s*(\d+),\s*model:\s*([\w.-]+)/.exec(message || '');
  if (!m) return null;
  const resetAt = Date.now() + waitSeconds * 1000;
  const update = {};
  for (const key of new Set([modelKey(m[2]), modelKey(asked || m[2])])) {
    update[`limits/${key}`] = Number(m[1]);
    update[`days/${usageDay()}/${key}/resetAt`] = resetAt;
  }
  return recordUsage((root) => root.update(update));
};

/** Staff: the admin emails, the old `admin` flag, or a superuser/manager/editor role. */
async function isStaff(auth) {
  const email = String(auth?.token?.email || '').toLowerCase();
  if (ADMIN_EMAILS.includes(email)) return true;
  const db = getDatabase();
  const [flag, role] = await Promise.all([
    db.ref(`quizusers/${auth.uid}/admin`).get().then((s) => s.val()),
    db.ref(`access/${auth.uid}/role`).get().then((s) => s.val()),
  ]);
  return flag === 'true' || flag === true || ['superuser', 'manager', 'editor'].includes(role);
}

/** The caller's allowance today (aiQuota.js). */
async function quotaFor(uid, staff) {
  const day = usageDay();
  const read = (path) => getDatabase().ref(`aiUsage/${path}`).get().then((s) => s.val() || {});
  const [today, limits, offAll, active, used, saved] = await Promise.all([
    read(`days/${day}`),
    read('limits'),
    read('off'),
    read('active'),
    read(`users/${day}/${uid}`),
    getDatabase().ref('aiConfig').get().then((s) => s.val() || {}),
  ]);
  const cfg = quotaConfig(saved);
  const off = Object.fromEntries(Object.entries(offAll).filter(([, d]) => d === day));
  const pool = dailyPool({ groqModels: GROQ_MODELS, geminiModels: MODELS, today, limits, off, cfg });
  return {
    ...userQuota({ pool, active: activeUsers(active, day, cfg, uid), used: Number(used) || 0, staff, cfg }),
    day,
  };
}

const OUT_OF_QUOTA = 'You have used your AI requests for today. They renew at midnight US Pacific time.';
const POOL_EMPTY = "Today's free AI allowance is used up for everyone. It renews at midnight US Pacific time.";

async function handle(request, response, use) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { uid } = request.auth;
  const staff = await isStaff(request.auth);
  const quota = await quotaFor(uid, staff);
  if (request.data?.task === 'quota') return { quota };
  if (request.data?.task === 'vote') return vote(uid, request.data);
  use.log = true;
  use.quota = quota;

  // Someone already had this question explained: the same answer, free.
  const qid = request.data?.task === 'explain' ? validKey(request.data.qid) : '';
  if (qid && !request.data.fresh) {
    const hit = await sharedExplanation(qid, request.data).catch((e) => logger.warn(`shared explain: ${e.message}`));
    if (hit) {
      use.status = 'cached';
      return { text: hit.text, model: hit.model, ...(hit.sources ? { sources: hit.sources } : {}), shared: true, quota };
    }
  }
  if (!quota.left) {
    use.status = 'limit';
    throw new HttpsError('resource-exhausted', quota.pool.left ? OUT_OF_QUOTA : POOL_EMPTY, { quota });
  }
  await recordUsage((root) => root.child(`active/${uid}`).set(quota.day));
  // Every request below is counted on this person.
  const count = (model, tokens) => {
    use.requests++;
    use.model = model;
    return countRequest(model, tokens, uid);
  };
  const withQuota = async (out) => ({ ...out, quota: await quotaFor(uid, staff) });
  // A key pasted into the masked secrets prompt can carry spaces, a line
  // break or quotes, which Google then reports as a bad OAuth token.
  const cleanKey = (secret) => String(secret.value() || '').replace(/[\s"']/g, '');
  const groqKey = cleanKey(GROQ_API_KEY);
  const key = cleanKey(GEMINI_API_KEY);
  if (!groqKey && !key) throw new HttpsError('failed-precondition', 'GROQ_API_KEY is not set on the server.');

  const provider = request.data?.provider;
  const useGroq = groqKey && provider !== 'gemini';
  const useGemini = key && provider !== 'groq';
  if (provider === 'gemini' && !key) throw new HttpsError('failed-precondition', 'GEMINI_API_KEY is not set on the server.');
  if (provider === 'groq' && !groqKey) throw new HttpsError('failed-precondition', 'GROQ_API_KEY is not set on the server.');

  if (request.data?.task === 'agent') {
    return withQuota(await runAgent(request.data, uid, {
      SYSTEM,
      groqKey: useGroq ? groqKey : '',
      geminiKey: key,
      useGemini: !!useGemini,
      groqModels: GROQ_MODELS,
      geminiModels: MODELS,
      GROQ_URL,
      thinkingFor,
      countRequest: count,
      recordLimit,
      findPassages,
    }));
  }

  let { contents, schema } = buildRequest(request.data);
  let sources;
  if (qid) {
    const linked = await linkedQuestions(qid).catch((e) => logger.warn(`linked questions: ${e.message}`));
    if (linked) contents[0].parts[0].text = linked + contents[0].parts[0].text;
  }
  if (request.data?.books && ['explain', 'chat'].includes(request.data.task)) {
    if (!key) throw new HttpsError('failed-precondition', 'Textbook search needs GEMINI_API_KEY (for embeddings).');
    try {
      sources = await findPassages(bookQuery(request.data), key);
    } catch (e) {
      logger.warn(`Book search failed: ${e.message}`);
      throw new HttpsError('unavailable', 'Could not search your textbooks right now, try again or turn it off.');
    }
    if (sources.length) contents = withPassages(contents, sources);
  }
  // Replies the app shows as they are written (explanations, chat) stream;
  // JSON sets are only useful whole.
  const stream = !schema && request.acceptsStreaming && response;
  let streamed = false; // once text has gone out, no other model may take over
  const send = (t) => {
    streamed = true;
    response.sendChunk(t);
  };

  // `counted` is the model asked for, which the daily pool knows by name;
  // the reply shows the version that answered.
  const finish = async (text, model, tokens, counted = model) => {
    await count(counted, tokens);
    if (!schema) {
      const out = { text, model, ...(sources ? { sources: sources.map(({ n, title, page, text: t }) => ({ n, title, page, text: t })) } : {}) };
      if (qid) await saveExplanation(qid, request.data, out, { uid, staff }).catch((e) => logger.warn(`save explain: ${e.message}`));
      return withQuota(out);
    }
    try {
      const parsed = JSON.parse(text);
      return withQuota({ items: Array.isArray(parsed) ? parsed : parsed.items, model });
    } catch {
      throw new HttpsError('internal', 'The AI returned malformed JSON, try again.');
    }
  };

  // ---------------------------------------------------------------- Groq
  // Any failure here (quota, outage, a bad key) hands over to Gemini, unless
  // part of the answer has already been streamed to the app.
  let groqError = '';
  if (useGroq) {
    // Groq structured outputs need an object at the root.
    const format = schema && {
      type: 'json_schema',
      json_schema: {
        name: 'items',
        schema: {
          type: 'object',
          properties: { items: toJsonSchema(schema) },
          required: ['items'],
          additionalProperties: false,
        },
      },
    };
    const body = (model) => ({
      model,
      messages: toMessages(contents),
      temperature: schema ? 0.6 : 0.4,
      // The free tier allows 8K tokens a minute, prompt included.
      max_completion_tokens: schema ? 6144 : 3072,
      // GPT-OSS reasons before answering; a little is enough for tutoring
      // and keeps replies quick. The reasoning itself is not sent back.
      reasoning_effort: 'low',
      include_reasoning: false,
      ...(stream ? { stream: true } : {}),
      ...(format ? { response_format: format } : {}),
    });

    groq: for (const model of GROQ_MODELS) {
      for (let attempt = 0; ; attempt++) {
        const r = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
          body: JSON.stringify(body(model)),
        });
        await recordLimit(model, Number(r.headers.get('x-ratelimit-limit-requests')));
        if (r.ok) {
          let text;
          let tokens;
          if (stream) ({ text, tokens } = await readChatSse(r, send));
          else {
            const j = await r.json().catch(() => ({}));
            text = j?.choices?.[0]?.message?.content || '';
            tokens = Number(j?.usage?.total_tokens) || 0;
          }
          if (text.trim()) return finish(text.trim(), model, tokens);
          if (streamed) throw new HttpsError('internal', 'The AI stopped mid-answer, try again.');
          groqError = `${model} returned an empty reply`;
          break;
        }
        const j = await r.json().catch(() => ({}));
        const wait = parseFloat(r.headers.get('retry-after')) || 0;
        // Per-minute limits and brief outages clear within seconds.
        if (attempt < 1 && ((r.status === 429 && wait <= 10) || [500, 502, 503].includes(r.status))) {
          await new Promise((ok) => setTimeout(ok, Math.min(Math.max(wait * 1000, 1500), 10_000)));
          continue;
        }
        groqError = `${model} ${r.status}: ${j?.error?.message || ''}`;
        logger.warn(`Groq ${groqError}`);
        if (r.status === 429 && wait > 60) await recordReset(model, wait); // daily allowance used up
        if (r.status === 401 || r.status === 403) break groq; // the key itself is wrong
        break;
      }
    }
    if (!useGemini) {
      if (/ 429:/.test(groqError)) {
        throw new HttpsError('resource-exhausted', "Today's free AI allowance is used up, try again later.");
      }
      if (/ 40[13]:/.test(groqError)) {
        throw new HttpsError(
          'failed-precondition',
          'Groq rejected the key. Copy it again from console.groq.com/keys and re-run ' +
            'firebase functions:secrets:set GROQ_API_KEY.',
        );
      }
      throw new HttpsError('internal', `AI error: ${clip(groqError, 300)}`);
    }
  }

  // -------------------------------------------------------------- Gemini
  let thinking = true;
  const bodyFor = (model) => ({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents,
    generationConfig: {
      temperature: schema ? 0.6 : 0.4,
      maxOutputTokens: schema ? 8192 : 3072,
      ...(thinking ? { thinkingConfig: thinkingFor(model) } : {}),
      ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
    },
  });

  const call = async (model) => {
    const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(bodyFor(model)),
    });
    if (!r.ok || !stream) return [r, await r.json().catch(() => ({}))];
    return [r, await readSse(r, send)];
  };
  // Seconds Google asks us to wait on a 429 ("retryDelay": "37s").
  const retryAfter = (j) =>
    parseFloat((j?.error?.details || []).find((d) => d.retryDelay)?.retryDelay) || 0;

  let res;
  let json;
  let model;
  let quotaWait = 0;
  const started = Date.now();
  for (model of MODELS) {
    // "High demand" (503) and per-minute rate limits usually clear within
    // seconds, so try the same model once more before moving on.
    for (let attempt = 0; ; attempt++) {
      [res, json] = await call(model);
      if (res.status === 400 && thinking && /thinking/i.test(json?.error?.message || '')) {
        thinking = false; // this model takes no thinking setting: ask again without it
        continue;
      }
      const wait = res.status === 429 ? retryAfter(json) : 0;
      if (res.status === 429 && wait > 30) break; // daily quota: no point retrying this model
      if (res.ok || ![429, 500, 503].includes(res.status) || attempt >= 1) break;
      await new Promise((r) => setTimeout(r, Math.min(Math.max(wait * 1000, 1500), 5000)));
    }
    if (res.ok || streamed) break;
    if (Date.now() - started > 60_000) break; // the app gives up at 120 s; leave time to say why
    logger.warn(`Gemini ${model} ${res.status}: ${json?.error?.message || ''} (key length ${key.length})`);
    // Out of quota, overloaded, or not open to the key: try the next one.
    if (res.status === 429) {
      quotaWait = Math.max(quotaWait, retryAfter(json));
      if (retryAfter(json) > 30) await recordQuotaHit(json?.error?.message, retryAfter(json), model);
    }
    else if (res.status === 404) await recordOff(model);
    else if (![403, 500, 503].includes(res.status)) break;
  }
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    if (quotaWait > 30) {
      const h = Math.floor(quotaWait / 3600);
      const m = Math.ceil((quotaWait % 3600) / 60);
      throw new HttpsError(
        'resource-exhausted',
        `Today's free Gemini quota is used up. It resets in about ${h ? `${h} h ` : ''}${m} min, ` +
          'or turn on billing for the key in AI Studio.',
      );
    }
    if (res.status === 401) {
      throw new HttpsError(
        'failed-precondition',
        'Google rejected the Gemini key. Copy it again from aistudio.google.com/apikey and re-run ' +
          'firebase functions:secrets:set GEMINI_API_KEY.',
      );
    }
    if (res.status === 402) throw new HttpsError('failed-precondition', 'The Gemini key has no credit left (AI Studio > billing).');
    if (res.status === 429) throw new HttpsError('resource-exhausted', 'Gemini rate limit reached, try again in a minute.');
    if (res.status === 503) throw new HttpsError('unavailable', 'Gemini is busy right now, try again in a minute.');
    throw new HttpsError('internal', `Gemini error: ${clip(msg, 300)}`);
  }

  const cand = json?.candidates?.[0];
  const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
  if (!text) {
    const why = cand?.finishReason || json?.promptFeedback?.blockReason || 'empty reply';
    throw new HttpsError('internal', `Gemini returned no answer (${why}).`);
  }

  // "-latest" is an alias; Google reports the concrete version it ran.
  return finish(text, json.modelVersion || model, Number(json.usageMetadata?.totalTokenCount) || 0, model);
}

// ------------------------------------------------------------------ log
// One line per use for the admins' AI activity page: aiUsage/log/<day>/<id>
// { uid, name, email, task, what, books, provider, model, requests, status,
//   error, ms, at, staff, limit, pool }. `what` is the topic, or the start of the question asked.
function whatWasAsked(data = {}) {
  const lastAsk = () => [...(data.messages || [])].reverse().find((m) => m.role !== 'model')?.text;
  const text =
    data.task === 'explain'
      ? data.question?.question
      : ['chat', 'agent'].includes(data.task)
        ? lastAsk()
        : data.topic;
  const about = data.task === 'chat' && data.context?.kind === 'question' ? ' (about an MCQ)' : '';
  return clip(String(text || '').replace(/\s+/g, ' ').trim(), 300) + about;
}

async function logUse(request, use, started) {
  const data = request.data || {};
  const token = request.auth?.token || {};
  const line = {
    uid: request.auth.uid,
    name: clip(token.name || '', 80),
    email: clip(token.email || '', 120),
    task: clip(data.task, 20),
    what: whatWasAsked(data),
    requests: use.requests,
    status: use.status,
    ms: Date.now() - started,
    at: Date.now(),
    ...(data.task === 'quiz' || data.task === 'cards' ? { count: Number(data.count) || null } : {}),
    ...(data.books ? { books: true } : {}),
    ...(data.provider ? { provider: clip(data.provider, 10) } : {}),
    ...(data.task === 'explain' && validKey(data.qid) ? { qid: data.qid, mode: data.books ? 'books' : 'bank' } : {}),
    ...(data.fresh ? { fresh: true } : {}),
    ...(use.model ? { model: clip(use.model, 60) } : {}),
    ...(use.error ? { error: clip(use.error, 200) } : {}),
    // The allowance at the time, for "% of own limit" and "% of the pool".
    ...(use.quota ? { staff: !!use.quota.unlimited, limit: use.quota.limit || 0, pool: use.quota.pool.total } : {}),
  };
  await recordUsage((root) => root.child(`log/${use.day}/${use.logId}`).set(line));
}

export const aiStudy = onCall(
  { secrets: [GROQ_API_KEY, GEMINI_API_KEY], timeoutSeconds: 120, memory: '1GiB', maxInstances: 3 },
  async (request, response) => {
    const use = { log: false, requests: 0, model: '', status: 'ok', day: usageDay() };
    use.logId = getDatabase().ref(`aiUsage/log/${use.day}`).push().key;
    const started = Date.now();
    try {
      const out = await handle(request, response, use);
      if (out?.model) use.model = out.model; // the version that answered
      // The app rates an answer by its log line.
      return use.log && out && typeof out === 'object' ? { ...out, logId: use.logId, logDay: use.day } : out;
    } catch (e) {
      if (use.status === 'ok') use.status = 'error';
      use.error = e.message;
      throw e;
    } finally {
      if (use.log) await logUse(request, use, started);
    }
  },
);
