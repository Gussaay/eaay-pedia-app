// The AI tutor with tools ("agent" task of aiStudy, see ai.js).
//
// Instead of only answering, the model may call tools and use what they
// return, a few steps at most per message:
//   search_questions  keyword search over the whole MCQ bank (quizqq)
//   search_textbooks  the indexed textbooks (books.js), cited as [n]
//   build_quiz        saves picked questions as aiquiz/<uid>/<id>, which the
//                     app opens like any quiz (/quiz/ai/<id>)
//   weak_topics       the student's own quizcats/quizstats
//   ask_user          a multiple-choice question back to the student; it ends
//                     the turn, and their tap comes back as the next message
//
// GPT-OSS on Groq runs it, with the same fall-back order as plain answers
// (the smaller Groq model, then Gemini). Every model call counts against the
// daily allowance, so tool results are kept short.
import { logger } from 'firebase-functions';
import { getDatabase } from 'firebase-admin/database';
import { HttpsError } from 'firebase-functions/v2/https';

const MAX_STEPS = 6;
const clip = (s, n) => String(s ?? '').slice(0, n);

const GUIDE = [
  'You can use tools. Use them when they make the answer better for this student, not for small talk.',
  'For practice requests: call search_questions (try a second, broader query if few match), then build_quiz',
  'with the most relevant 5-20 question ids. Never invent ids: only use ids that search_questions returned.',
  'For "what should I revise" or anything about how the student is doing: call weak_topics.',
  'For facts, call search_textbooks; cite its passages inline as [1], [2] and only for what they say.',
  'If the textbooks or the bank have nothing relevant, say so briefly and answer from general knowledge.',
  'Call ask_user only when a real choice is needed (level, topic, how many questions), at most once,',
  'with 2-5 short options. After tools, reply briefly: what you found or built and what to do next.',
].join(' ');

const TOOLS = [
  {
    name: 'search_questions',
    description: 'Keyword search over the Easy Pedia MCQ bank (all books). Returns matching questions with their ids.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Key terms, e.g. "kawasaki aneurysm" or "neonatal jaundice phototherapy"' },
        limit: { type: 'integer', description: 'How many to return, 1-20 (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_textbooks',
    description: "Search the student's own indexed textbooks. Returns numbered passages with book and page.",
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What to look up' } },
      required: ['query'],
    },
  },
  {
    name: 'build_quiz',
    description: 'Save a practice quiz from question ids returned by search_questions. The app shows an Open quiz button.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title, e.g. "Kawasaki disease"' },
        question_ids: { type: 'array', items: { type: 'string' }, description: 'Ids from search_questions, best first' },
      },
      required: ['title', 'question_ids'],
    },
  },
  {
    name: 'weak_topics',
    description: "The student's weakest topics (accuracy by category) and their most recent quiz scores.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'ask_user',
    description: 'Ask the student one multiple-choice question. Ends your turn; their choice arrives as their next message.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, description: '2-5 short options' },
      },
      required: ['question', 'options'],
    },
  },
];

// ------------------------------------------------------------ question bank
// The whole bank, reduced to what search needs, kept for 30 minutes per
// function instance.
let bank = null; // { at, list: [{ id, q, text, answer, book, chapter }], df: Map }
const STOP = new Set(
  'the and for with that this from what which most likely following child children year years old month months who have has are was were not all any best next management diagnosis'.split(' '),
);
const words = (s) => (String(s).toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || []).filter((w) => !STOP.has(w));

async function loadBank() {
  if (bank && Date.now() - bank.at < 30 * 60 * 1000) return bank;
  const all = (await getDatabase().ref('quizqq').get()).val() || {};
  const list = [];
  const df = new Map();
  for (const [id, r] of Object.entries(all)) {
    if (!r || r.question === undefined) continue;
    const opts = ['a', 'b', 'c', 'd', 'e'].map((k) => r[k] || '').join(' ');
    const head = new Set(words(`${r.question} ${r.category1 || ''} ${r.category2 || ''} ${r.chapter || ''}`));
    const rest = new Set(words(`${opts} ${clip(r.exp, 600)}`));
    const answer = String(r.answer || '').trim().toLowerCase();
    list.push({
      id,
      q: clip(String(r.question).replace(/\s+/g, ' '), 220),
      head,
      rest,
      answer: clip(r[answer] || answer, 80),
      book: clip(r.title || r.source || '', 60),
      chapter: clip(r.category1 || r.chapter || '', 50),
      same: r.same_as || '',
    });
    new Set([...head, ...rest]).forEach((w) => df.set(w, (df.get(w) || 0) + 1));
  }
  bank = { at: Date.now(), list, df };
  logger.info(`agent: question bank loaded, ${list.length} questions`);
  return bank;
}

async function searchQuestions({ query, limit }) {
  const { list, df } = await loadBank();
  const terms = [...new Set(words(query))];
  if (!terms.length) return { found: 0, questions: [] };
  const n = list.length || 1;
  const idf = Object.fromEntries(terms.map((t) => [t, Math.log(1 + n / (1 + (df.get(t) || 0)))]));
  const scored = [];
  for (const item of list) {
    let s = 0;
    let hits = 0;
    for (const t of terms) {
      if (item.head.has(t)) {
        s += 2 * idf[t];
        hits++;
      } else if (item.rest.has(t)) {
        s += idf[t];
        hits++;
      }
    }
    if (hits) scored.push([s * (hits / terms.length), item]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  // A recall question repeated in several sittings has a copy in each; one is enough.
  const seen = new Set();
  const out = [];
  for (const [, it] of scored) {
    const key = it.same || it.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: it.id, question: it.q, answer: it.answer, book: it.book, chapter: it.chapter });
    if (out.length >= Math.max(1, Math.min(20, Number(limit) || 10))) break;
  }
  return { found: scored.length, questions: out };
}

async function buildQuiz({ title, question_ids: ids }, uid) {
  const { list } = await loadBank();
  const have = new Set(list.map((q) => q.id));
  const keys = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter((id) => have.has(id)).slice(0, 50);
  if (!keys.length) return { error: 'None of those ids exist. Use ids returned by search_questions.' };
  const ref = getDatabase().ref(`aiquiz/${uid}`).push();
  const quiz = { title: clip(title, 80) || 'AI practice quiz', keys, at: Date.now() };
  await ref.set(quiz);
  return { quiz_id: ref.key, title: quiz.title, count: keys.length };
}

async function weakTopics(uid) {
  const db = getDatabase();
  const [cats, stats] = await Promise.all([
    db.ref(`quizcats/${uid}`).get().then((s) => s.val() || {}),
    db.ref(`quizstats/${uid}`).get().then((s) => s.val() || {}),
  ]);
  const topics = Object.values(cats)
    .map((v) => ({ topic: v?.name || '', answered: Number(v?.played) || 0, correct: Number(v?.correct) || 0 }))
    .filter((t) => t.topic && t.answered >= 5)
    .map((t) => ({ ...t, accuracy: Math.round((t.correct / t.answered) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 8)
    .map(({ topic, answered, accuracy }) => ({ topic, answered, accuracy }));
  const recent = Object.values(stats)
    .map((v) => ({ quiz: clip(v?.title, 60), last: Number(v?.last) || 0, best: Number(v?.best) || 0, at: Number(v?.at) || 0 }))
    .sort((a, b) => b.at - a.at)
    .slice(0, 5)
    .map(({ quiz, last, best }) => ({ quiz, last_percent: last, best_percent: best }));
  if (!topics.length && !recent.length) return { note: 'No quiz history yet.' };
  return { weakest_topics: topics, recent_quizzes: recent };
}

// ------------------------------------------------------------ model calls
// Messages are kept in chat-completions form; Gemini gets a translation.
function toGemini(messages) {
  const contents = [];
  const push = (role, part) => {
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(part);
    else contents.push({ role, parts: [part] });
  };
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') push('user', { text: m.content });
    else if (m.role === 'assistant') {
      if (m.gparts) m.gparts.forEach((p) => push('model', p));
      else if (m.tool_calls?.length) {
        // A step another model took: told as text, so no Gemini signature is needed.
        const said = m.tool_calls.map((c) => `I called ${c.function.name}(${c.function.arguments}).`).join(' ');
        push('model', { text: [m.content, said].filter(Boolean).join('\n') });
      } else if (m.content) push('model', { text: m.content });
    } else if (m.role === 'tool') {
      if (m.native) push('user', { functionResponse: { name: m.name, response: { result: JSON.parse(m.content) } } });
      else push('user', { text: `Result of ${m.name}: ${m.content}` });
    }
  }
  return contents;
}

const geminiTools = [
  {
    functionDeclarations: TOOLS.map((t) =>
      Object.keys(t.parameters.properties).length ? t : { name: t.name, description: t.description },
    ),
  },
];

/**
 * One model step with fall-back. `state.at` is the provider in use; a
 * failure moves it along for the rest of the run. Returns the assistant
 * message ({ content, tool_calls, gparts? }) and the model that wrote it.
 */
async function step(messages, state, ctx, final) {
  while (state.at < state.chain.length) {
    const { provider, model } = state.chain[state.at];
    try {
      const { tokens, ...msg } = provider === 'groq' ? await groqStep(messages, model, ctx, final) : await geminiStep(messages, model, ctx, final);
      await ctx.countRequest(model, tokens);
      return { msg, model };
    } catch (e) {
      logger.warn(`agent ${provider} ${model}: ${e.message}`);
      state.lastError = e;
      state.at++;
    }
  }
  if (/429/.test(state.lastError?.message || '')) {
    throw new HttpsError('resource-exhausted', "Today's free AI allowance is used up, try again later.");
  }
  throw new HttpsError('internal', `AI error: ${clip(state.lastError?.message, 300)}`);
}

async function groqStep(messages, model, ctx, final) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(ctx.GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.groqKey}` },
      body: JSON.stringify({
        model,
        messages: messages.map(({ gparts, native, ...m }) => m),
        tools: TOOLS.map((t) => ({ type: 'function', function: t })),
        tool_choice: final ? 'none' : 'auto',
        temperature: 0.3,
        max_completion_tokens: 2048,
        reasoning_effort: 'low',
        include_reasoning: false,
      }),
    });
    await ctx.recordLimit(model, Number(r.headers.get('x-ratelimit-limit-requests')));
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const m = j?.choices?.[0]?.message || {};
      return {
        role: 'assistant',
        content: m.content || '',
        tokens: Number(j?.usage?.total_tokens) || 0,
        ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}),
      };
    }
    const wait = parseFloat(r.headers.get('retry-after')) || 0;
    if (attempt < 1 && ((r.status === 429 && wait <= 10) || [500, 502, 503].includes(r.status))) {
      await new Promise((ok) => setTimeout(ok, Math.min(Math.max(wait * 1000, 1500), 10_000)));
      continue;
    }
    throw new Error(`${r.status} ${j?.error?.message || ''}`);
  }
}

async function geminiStep(messages, model, ctx, final) {
  const system = messages.find((m) => m.role === 'system')?.content || '';
  let thinking = true;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ctx.geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: toGemini(messages),
        tools: geminiTools,
        toolConfig: { functionCallingConfig: { mode: final ? 'NONE' : 'AUTO' } },
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          ...(thinking ? { thinkingConfig: ctx.thinkingFor(model) } : {}),
        },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 400 && thinking && /thinking/i.test(j?.error?.message || '')) {
      thinking = false;
      continue;
    }
    if (!r.ok) {
      if (attempt < 1 && [500, 503].includes(r.status)) {
        await new Promise((ok) => setTimeout(ok, 1500));
        continue;
      }
      throw new Error(`${r.status} ${j?.error?.message || ''}`);
    }
    const parts = j?.candidates?.[0]?.content?.parts || [];
    const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
    const calls = parts
      .filter((p) => p.functionCall)
      .map((p, i) => ({
        id: `g${Date.now()}${i}`,
        type: 'function',
        function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) },
      }));
    return {
      role: 'assistant',
      content: text,
      tokens: Number(j?.usageMetadata?.totalTokenCount) || 0,
      ...(calls.length ? { tool_calls: calls, gparts: parts } : {}),
    };
  }
}

// ------------------------------------------------------------------- run
/**
 * Runs one student message through the tool loop. `data.messages` is the chat
 * so far as [{ role: 'user' | 'model', text }]; returns
 * { text, model, steps, quizzes, ask?, sources? }.
 */
export async function runAgent(data, uid, ctx) {
  const chat = (Array.isArray(data.messages) ? data.messages : [])
    .slice(-16)
    .map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: clip(m.text, 3000) }))
    .filter((m) => m.content.trim());
  if (!chat.length || chat[chat.length - 1].role !== 'user') throw new HttpsError('invalid-argument', 'Nothing to answer.');

  const messages = [{ role: 'system', content: `${ctx.SYSTEM} ${GUIDE}` }, ...chat];
  const chain = [
    ...(ctx.groqKey ? ctx.groqModels.map((model) => ({ provider: 'groq', model })) : []),
    ...(ctx.geminiKey && ctx.useGemini ? ctx.geminiModels.map((model) => ({ provider: 'gemini', model })) : []),
  ];
  if (!chain.length) throw new HttpsError('failed-precondition', 'GROQ_API_KEY is not set on the server.');
  const state = { chain, at: 0 };

  const steps = [];
  const quizzes = [];
  const sources = [];
  let model = '';

  for (let i = 0; i <= MAX_STEPS; i++) {
    const { msg, model: used } = await step(messages, state, ctx, i === MAX_STEPS);
    model = used;
    messages.push(msg);
    if (!msg.tool_calls?.length) {
      const text = String(msg.content || '').trim() || (quizzes.length ? 'Your quiz is ready.' : 'Done.');
      return { text, model, steps, quizzes, ...(sources.length ? { sources } : {}) };
    }

    for (const call of msg.tool_calls) {
      const name = call.function?.name;
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments || '{}') || {};
      } catch {
        /* the model sent broken JSON: the tool reports what is missing */
      }

      if (name === 'ask_user') {
        const options = (Array.isArray(args.options) ? args.options : []).map((o) => clip(o, 80)).filter(Boolean).slice(0, 5);
        const question = clip(args.question, 300) || String(msg.content || '').trim();
        return {
          text: String(msg.content || '').trim(),
          model,
          steps,
          quizzes,
          ask: { question, options },
          ...(sources.length ? { sources } : {}),
        };
      }

      let result;
      try {
        if (name === 'search_questions') {
          result = await searchQuestions(args);
          steps.push({ tool: name, label: `Searched the question bank for "${clip(args.query, 60)}": ${result.found} found` });
        } else if (name === 'search_textbooks') {
          if (!ctx.geminiKey) result = { error: 'Textbook search is not set up.' };
          else {
            const found = await ctx.findPassages(clip(args.query, 1000), ctx.geminiKey, 4);
            const numbered = found.map((p) => ({ ...p, n: sources.length + found.indexOf(p) + 1 }));
            numbered.forEach(({ n, title, page, text }) => sources.push({ n, title, page, text }));
            result = numbered.length
              ? { passages: numbered.map(({ n, title, page, text }) => ({ n, book: title, page, text })) }
              : { note: 'No textbooks indexed, or nothing relevant.' };
            steps.push({ tool: name, label: `Searched your textbooks for "${clip(args.query, 60)}": ${numbered.length} passages` });
          }
        } else if (name === 'build_quiz') {
          result = await buildQuiz(args, uid);
          if (result.quiz_id) {
            quizzes.push({ id: result.quiz_id, title: result.title, count: result.count });
            steps.push({ tool: name, label: `Built the quiz "${result.title}" (${result.count} questions)` });
          }
        } else if (name === 'weak_topics') {
          result = await weakTopics(uid);
          steps.push({ tool: name, label: 'Checked your quiz history' });
        } else {
          result = { error: `Unknown tool ${name}` };
        }
      } catch (e) {
        logger.warn(`agent tool ${name}: ${e.message}`);
        result = { error: clip(e.message, 200) };
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name,
        content: JSON.stringify(result),
        native: !!msg.gparts, // Gemini wants its own call answered as a functionResponse
      });
    }
  }
  throw new HttpsError('internal', 'The AI took too many steps, try asking more simply.');
}
