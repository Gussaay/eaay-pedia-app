// Open topic tags and checked links for every quiz question, by an AI that
// reads each question (Gemini, with Groq as backup):
//
//   node scripts/ai-tag.mjs --phase tag   [--max-calls 400]
//       Each question gets a main topic, up to 4 more tags and the one fact it
//       tests, in its own words but under standard names (data/exams/tags/
//       topics.txt is offered as the preferred names, new names are allowed).
//   node scripts/ai-tag.mjs --phase merge [--max-calls 50]
//       New names are merged into one standard name per topic (synonyms,
//       spellings, abbreviations).
//   node scripts/ai-tag.mjs --phase link  [--max-calls 400]
//       Candidate pairs (a shared topic, or close wording) are judged one by
//       one: linked only when both test the same fact or concept.
//   node scripts/ai-tag.mjs --phase report
//       Progress, the most used topics, samples, and the result on the DOH
//       (HAAD) links checked by hand (recall and the extra links found).
//   node scripts/ai-tag.mjs --phase write [--commit]
//       Writes tags/topic (tags_auto "1"), the qtags index and similar links.
//
// Work in progress is kept in the database under aitag/, so every run goes on
// where the last stopped (free API tiers allow a few hundred requests a day):
//   aitag/q/<id>        { m: main, t: [tags], f: fact, h: text hash }
//   aitag/canon/<slug>  standard label for a raw name
//   aitag/pair/<a>__<b> 1 linked, 0 not linked (a < b)
// Keys: GEMINI_API_KEY and/or GROQ_API_KEY in the environment. Hand tags
// (scripts/tag-exam.mjs, no tags_auto) are kept as they are.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseTopics, tagSlug, tagsOf } from '../src/lib/topicTags.js';

const args = process.argv.slice(2);
const value = (name, d = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? d : args[i + 1];
};
const project = value('project', 'easy-pedia');
const phase = value('phase', 'report');
const maxCalls = Number(value('max-calls', 400));
const fb = (cmdArgs) =>
  execFileSync('firebase', cmdArgs, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
  });
const read = (node) => {
  fs.mkdirSync('.tmp', { recursive: true });
  const out = path.join('.tmp', `get-${node.replace(/\//g, '_')}.json`);
  fb(['database:get', `/${node}`, '--project', project, '--output', out]);
  return JSON.parse(fs.readFileSync(out, 'utf8') || 'null') || {};
};
const write = (updates, name) => {
  if (!Object.keys(updates).length) return;
  const out = path.join('.tmp', `${name}.json`);
  fs.writeFileSync(out, JSON.stringify(updates));
  fb(['database:update', '/', JSON.stringify(out), '--project', project, '--force']);
};
const clean = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const answerOf = (q) => clean(q?.[String(q?.answer || '').trim().toLowerCase()]);
const hashOf = (q) =>
  crypto.createHash('sha1').update(`${clean(q.question)}|${answerOf(q)}`).digest('hex').slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ the AI
const geminiKey = process.env.GEMINI_API_KEY || '';
const groqKey = process.env.GROQ_API_KEY || '';
const models = [
  ...(geminiKey ? (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest,gemini-3.5-flash-lite,gemini-flash-latest,gemini-3.8-flash').split(',').map((m) => ({ provider: 'gemini', model: m })) : []),
  ...(groqKey ? (await groqModels()).map((m) => ({ provider: 'groq', model: m })) : []),
];

/** Groq's text models that this key can use now; each has its own free quota. */
async function groqModels() {
  if (process.env.GROQ_MODEL) return process.env.GROQ_MODEL.split(',');
  const first = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'moonshotai/kimi-k2-instruct', 'qwen/qwen3-32b', 'meta-llama/llama-4-scout-17b-16e-instruct', 'openai/gpt-oss-20b'];
  const j = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${groqKey}` } })
    .then((r) => r.json())
    .catch(() => ({}));
  const ids = (j.data || [])
    .filter((m) => m.active !== false && !/whisper|tts|guard|orpheus|playai|compound|embed|distil|allam/i.test(m.id))
    .map((m) => m.id);
  if (!ids.length) return first;
  const rank = (id) => (first.includes(id) ? first.indexOf(id) : first.length);
  return ids.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
const spent = new Set(); // models out of quota for today
const fits = new Map(); // model → longest prompt (characters) it accepts
let tooBig = false; // last ask() failed only because the prompt was too long
let calls = 0;
let allSpent = false; // every model out of quota for today
let lastCall = 0;

async function askOnce({ provider, model }, prompt, out) {
  if (process.env.AI_MOCK) return [200, await import(path.resolve(process.env.AI_MOCK)).then((m) => m.default(prompt))];
  const wait = 4200 - (Date.now() - lastCall); // ≤ 15 requests a minute
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  if (provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 16384, responseMimeType: 'application/json' },
      }),
    });
    const j = await r.json().catch(() => ({}));
    const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return [r.status, r.ok ? text : j?.error?.message || ''];
  }
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: out, // counts against the per-minute token limit, so keep it to what the reply needs
      ...(/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {}),
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  return [r.status, r.ok ? j?.choices?.[0]?.message?.content || '' : j?.error?.message || ''];
}

/**
 * JSON from the first model with quota left; null when every model is spent,
 * or (with tooBig set) when the models left only take a shorter prompt.
 * out: tokens the reply may need.
 */
async function ask(prompt, out = 4000) {
  tooBig = false;
  for (const m of models) {
    if (spent.has(m.model)) continue;
    if (prompt.length > (fits.get(m.model) ?? Infinity)) {
      tooBig = true;
      continue;
    }
    let skip = false; // try the next model without writing this one off
    let waits = 0; // per-minute limit waits on this model
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (calls >= maxCalls) return null;
      calls += 1;
      const [status, text] = await askOnce(m, prompt, out).catch((e) => [0, e.message]);
      if (status === 200) {
        try {
          return JSON.parse(String(text).replace(/^```(json)?|```$/g, '').trim());
        } catch {
          console.log(`  ${m.model}: reply was not JSON, asking again`);
          continue;
        }
      }
      console.log(`  ${m.model} ${status}: ${String(text).slice(0, 160)}`);
      // spent for today ("today" alone is Groq's upgrade advert, not a daily limit)
      if (status === 429 && (/per day|daily|\b(TPD|RPD)\b/i.test(text) || (m.provider === 'gemini' && /quota/i.test(text)))) break;
      const asked = Number(String(text).match(/Requested (\d+)/)?.[1]);
      const limit = Number(String(text).match(/Limit (\d+)/)?.[1]);
      if (status === 413 || asked > limit || (status === 400 && /reduce the length/i.test(text))) {
        // prompt too big for this model: remember what fits and ask for a smaller batch
        fits.set(m.model, Math.floor(prompt.length * Math.min(0.9, asked > limit ? (limit / asked) * 0.9 : 0.5)));
        tooBig = true;
        skip = true;
        break;
      }
      if (status === 400 && /validate JSON|json_validate/i.test(text)) {
        if (attempt === 2) skip = true;
        continue;
      }
      if (status === 429 && waits < 20) {
        // per-minute limit: wait as long as the API says, then try the same model again
        const s = Number(String(text).match(/try again in (?:(\d+)m)?([\d.]+)s/i)?.slice(1).reduce((a, v, i) => a + (Number(v) || 0) * (i ? 1 : 60), 0)) || 30;
        waits += 1;
        attempt -= 1;
        await sleep(Math.min(s + 1, 65) * 1000);
        continue;
      }
      if (![0, 429, 500, 502, 503].includes(status)) break;
      await sleep(5000);
    }
    if (!skip) spent.add(m.model);
  }
  if (tooBig) return null;
  allSpent = true;
  return null;
}

// ------------------------------------------------------------------ data
const topicText = fs.readFileSync('data/exams/tags/topics.txt', 'utf8');
const preferred = parseTopics(topicText).map((t) => t.label);
console.log(`Reading quizqq, allquiz and aitag… (${models.map((m) => m.model).join(', ') || 'no AI key'})`);
const all = read('quizqq');
const quizTitle = Object.fromEntries(Object.values(read('allquiz')).filter(Boolean).map((q) => [q.key, clean(q.title)]));
const state = read('aitag');
state.q ||= {};
state.canon ||= {};
state.pair ||= {};
const list = Object.entries(all).filter(([, q]) => q && q.question !== undefined);
const isHand = (q) => tagsOf(q).length > 0 && q.tags_auto !== '1';
const brief = (q, n = 700) => {
  const opts = ['a', 'b', 'c', 'd', 'e', 'f'].filter((k) => clean(q[k])).map((k) => `${k}) ${clean(q[k]).slice(0, 120)}`);
  return `${clean(q.question).slice(0, n)}\n${opts.join('\n')}\nAnswer: ${String(q.answer || '').trim().toLowerCase()}`;
};
// A raw name's standard label: merged name, else a preferred name with the same slug, else itself.
const prefBySlug = new Map(preferred.map((l) => [tagSlug(l), l]));
const canon = (label) => {
  const s = tagSlug(label);
  return state.canon[s] || prefBySlug.get(s) || String(label).trim();
};

// ------------------------------------------------------------------ tag
if (phase === 'tag') {
  const todo = list.filter(([id, q]) => state.q[id]?.h !== hashOf(q));
  console.log(`${list.length} questions, ${todo.length} to tag.`);
  if (!todo.length) console.log('NOTHING TO DO');
  let size = Number(value('batch', 20));
  let done = 0;
  for (let i = 0; i < todo.length; ) {
    const batch = todo.slice(i, i + size);
    const prompt = [
      'You index paediatric exam MCQs (MRCPCH, DOH/HAAD, Nelson, SMSB) for a study app, so questions on the same point can be found together.',
      'For EACH question return:',
      '- "main": the single most specific topic the question tests: a disease, syndrome, drug, organism, investigation, sign, procedure, or concept (e.g. "Kawasaki disease", "Neonatal hypoglycaemia", "Developmental milestones", "Statistical tests").',
      '- "tags": 0-4 other topics central to answering it (the correct answer if it is a diagnosis, drug or test; key differentials that are actually discussed). No generic words like Paediatrics, Diagnosis, Management, Child, Treatment.',
      '- "fact": the exact point tested, at most 15 words (e.g. "Kawasaki disease: IVIG within 10 days prevents coronary aneurysms").',
      'Names: use standard textbook names in British spelling, singular, without abbreviations (write "Attention deficit hyperactivity disorder", not "ADHD"). When one of these preferred names fits, use it exactly; otherwise make a new standard name.',
      `Preferred names: ${preferred.join('; ')}`,
      'Reply only with JSON: {"items":[{"id":"…","main":"…","tags":["…"],"fact":"…"}]} with one item per question, same ids.',
      '',
      ...batch.map(([id, q]) => `### id: ${id}\n${brief(q)}`),
    ].join('\n');
    const reply = await ask(prompt, 500 + 100 * batch.length);
    if (!reply && tooBig && size > 1) {
      size = Math.ceil(size / 2);
      console.log(`  smaller batches: ${size}`);
      continue;
    }
    if (!reply) break;
    i += batch.length;
    const updates = {};
    for (const it of reply.items || []) {
      const q = all[it?.id];
      if (!q || !it.main) continue;
      const tags = (Array.isArray(it.tags) ? it.tags : []).map((t) => clean(t)).filter(Boolean).slice(0, 4);
      updates[`aitag/q/${it.id}`] = { m: clean(it.main).slice(0, 80), t: tags.map((t) => t.slice(0, 80)), f: clean(it.fact).slice(0, 200), h: hashOf(q) };
      done += 1;
    }
    write(updates, 'aitag-q');
    Object.assign(state.q, Object.fromEntries(Object.entries(updates).map(([k, v]) => [k.split('/')[2], v])));
    console.log(`  ${i}/${todo.length} (${calls} requests)`);
  }
  console.log(`Tagged ${done} questions this run; ${list.filter(([id, q]) => state.q[id]?.h !== hashOf(q)).length} left.`);
}

// ------------------------------------------------------------------ merge
if (phase === 'merge') {
  const count = new Map();
  for (const v of Object.values(state.q)) for (const l of [v.m, ...(v.t || [])]) if (l) count.set(tagSlug(l), [l, (count.get(tagSlug(l))?.[1] || 0) + 1]);
  // Names not yet standard: not a preferred name and never merged.
  const fresh = [...count.values()].filter(([l]) => !prefBySlug.has(tagSlug(l)) && !state.canon[tagSlug(l)]).sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`${count.size} distinct names, ${fresh.length} still to standardise.`);
  if (!fresh.length) console.log('NOTHING TO DO');
  const standard = () => [...new Set([...preferred, ...Object.values(state.canon)])].sort();
  const BATCH = Number(value('batch', 250));
  for (let i = 0; i < fresh.length; i += BATCH) {
    const batch = fresh.slice(i, i + BATCH);
    const reply = await ask(
      [
        'These topic names were given to paediatric exam questions. Map each to ONE standard name so the same topic always has the same name:',
        '- If it means the same as a name in the standard list (synonym, abbreviation, spelling, plural, eponym, or a narrower wording that should not stand alone), give that standard name exactly.',
        '- If it is a genuinely distinct topic, give it a clean standard name (British spelling, singular, no abbreviation); it may be itself.',
        '- Keep distinct conditions apart (e.g. "Type 1 diabetes" is not "Diabetes insipidus"; "Bronchiolitis" is not "Bronchiolitis obliterans").',
        `Standard list: ${standard().join('; ')}`,
        'Reply only with JSON: {"map":{"<name>":"<standard name>", …}} for every name below.',
        '',
        ...batch.map(([l, n]) => `${l} (${n})`),
      ].join('\n'),
    );
    if (!reply) break;
    const updates = {};
    for (const [l, to] of Object.entries(reply.map || {})) {
      const s = tagSlug(l.replace(/\s*\(\d+\)$/, ''));
      if (s && to) updates[`aitag/canon/${s}`] = state.canon[s] = clean(to).slice(0, 80);
    }
    write(updates, 'aitag-canon');
    console.log(`  ${Math.min(i + BATCH, fresh.length)}/${fresh.length}`);
  }
}

// ------------------------------------------------------------------ candidates
// Pairs worth judging: a shared standard topic (main or tag), or close
// wording. Both from different quizzes, not already the same question.
function candidates() {
  const tagged = list.filter(([id]) => state.q[id]);
  const topics = new Map(); // id → Set(slug), main first
  for (const [id] of tagged) {
    const v = state.q[id];
    topics.set(id, [...new Set([v.m, ...(v.t || [])].map((l) => tagSlug(canon(l))))]);
  }
  const STOP = new Set('the and with for are was who what which that this from has have had his her him she they them their there than then into most likely following your you not but all any can may will would should could does did been being also only each other some such very more less about between presents presented year years old month months week weeks day days child boy girl baby infant patient true correct statement diagnosis management investigation next step'.split(' '));
  const words = (s) => (s.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.replace(/([^s])s$/, '$1'));
  const tf = new Map();
  const df = new Map();
  for (const [id, q] of tagged) {
    const m = new Map();
    for (const w of words(`${clean(q.question)} ${answerOf(q)} ${state.q[id].f || ''}`)) m.set(w, (m.get(w) || 0) + 1);
    tf.set(id, m);
    for (const w of m.keys()) df.set(w, (df.get(w) || 0) + 1);
  }
  const vec = new Map();
  for (const [id, m] of tf) {
    const v = new Map();
    let n = 0;
    for (const [w, c] of m) {
      const x = (1 + Math.log(c)) * Math.log(tf.size / df.get(w));
      v.set(w, x);
      n += x * x;
    }
    vec.set(id, { v, n: Math.sqrt(n) || 1 });
  }
  const cos = (a, b) => {
    const [x, y] = a.v.size < b.v.size ? [a, b] : [b, a];
    let s = 0;
    for (const [w, k] of x.v) s += k * (y.v.get(w) || 0);
    return s / (a.n * b.n);
  };
  const byTopic = new Map();
  for (const [id, slugs] of topics) for (const s of slugs) (byTopic.get(s) || byTopic.set(s, []).get(s)).push(id);
  const byWord = new Map(); // rarer words only, to find close wording quickly
  for (const [id, { v }] of vec) {
    const top = [...v].sort((a, b) => b[1] - a[1]).slice(0, 8);
    for (const [w] of top) (byWord.get(w) || byWord.set(w, []).get(w)).push(id);
  }
  const pairs = new Map(); // "a__b" → { shared, cos }
  const consider = (a, b, shared) => {
    if (a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    const qa = all[x];
    const qb = all[y];
    if (qa.key === qb.key || qa.same?.[y] || qb.same?.[x] || qa.same_as === y || qb.same_as === x) return;
    const k = `${x}__${y}`;
    const p = pairs.get(k) || { shared: 0, cos: cos(vec.get(x), vec.get(y)) };
    p.shared += shared;
    pairs.set(k, p);
  };
  const minCos = Number(value('min-cos', 0.12));
  const wideCos = Number(value('wide-cos', 0.3));
  for (const [s, ids] of byTopic) {
    if (ids.length > 400) continue; // too broad to say anything on its own
    for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) consider(ids[i], ids[j], s === topics.get(ids[i])[0] || s === topics.get(ids[j])[0] ? 2 : 1);
  }
  for (const ids of byWord.values()) {
    if (ids.length > 60) continue;
    for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) consider(ids[i], ids[j], 0);
  }
  // Worth asking: a shared topic with some common wording, or very close
  // wording. Then only each question's closest --per (default 12), so a big
  // topic does not ask about every pair inside it.
  const per = Number(value('per', 12));
  const ok = [...pairs]
    .filter(([, p]) => (p.shared && p.cos >= minCos) || p.cos >= wideCos)
    .map(([k, p]) => [k, { ...p, score: p.cos + 0.1 * p.shared }]);
  const best = new Map();
  for (const [k, p] of ok) for (const id of k.split('__')) (best.get(id) || best.set(id, []).get(id)).push([p.score, k]);
  const keep = new Set();
  for (const list2 of best.values()) list2.sort((a, b) => b[0] - a[0]).slice(0, per).forEach(([, k]) => keep.add(k));
  return ok.filter(([k]) => keep.has(k));
}

// ------------------------------------------------------------------ link
if (phase === 'link') {
  const untagged = list.filter(([id, q]) => state.q[id]?.h !== hashOf(q)).length;
  if (untagged && !args.includes('--force')) {
    console.log(`${untagged} questions still to tag; links wait until every question has its topics.`);
    process.exit(0);
  }
  const cand = candidates();
  const todo = cand.filter(([k]) => state.pair[k] === undefined).sort((a, b) => b[1].shared - a[1].shared || b[1].cos - a[1].cos);
  console.log(`${cand.length} candidate pairs, ${todo.length} still to judge.`);
  if (!todo.length) console.log('NOTHING TO DO');
  let size = Number(value('batch', 25));
  const show = (id) => {
    const q = all[id];
    return `${clean(q.question).slice(0, 350)} | Answer: ${answerOf(q).slice(0, 100)} | Tests: ${state.q[id]?.f || ''}`;
  };
  for (let i = 0; i < todo.length; ) {
    const batch = todo.slice(i, i + size);
    const reply = await ask(
      [
        'Decide for each pair of paediatric exam questions whether they are LINKED: both test the same specific fact or concept, so a student who learns the answer to one is directly helped with the other (same condition AND same aspect, e.g. both on the first-line treatment of Kawasaki disease, or one asks the diagnosis and the other a key feature that defines it).',
        'NOT linked: same condition but unrelated aspects (e.g. epidemiology vs. drug dose), or only a shared broad area.',
        'Reply only with JSON: {"r":{"<pair number>":1 or 0, …}} for every pair.',
        '',
        ...batch.map(([k], n) => {
          const [a, b] = k.split('__');
          return `Pair ${n + 1}\nA: ${show(a)}\nB: ${show(b)}`;
        }),
      ].join('\n'),
      500 + 15 * batch.length,
    );
    if (!reply && tooBig && size > 1) {
      size = Math.ceil(size / 2);
      console.log(`  smaller batches: ${size}`);
      continue;
    }
    if (!reply) break;
    i += batch.length;
    const updates = {};
    batch.forEach(([k], n) => {
      const v = reply.r?.[String(n + 1)];
      if (v === 0 || v === 1 || v === '0' || v === '1') updates[`aitag/pair/${k}`] = state.pair[k] = Number(v);
    });
    write(updates, 'aitag-pair');
    console.log(`  ${i}/${todo.length} (${calls} requests)`);
  }
}

// ------------------------------------------------------------------ report
if (phase === 'report' || phase === 'write') {
  const left = list.filter(([id, q]) => state.q[id]?.h !== hashOf(q)).length;
  const names = new Map();
  for (const [id] of list) {
    const v = state.q[id];
    if (v) for (const l of [v.m, ...(v.t || [])]) names.set(tagSlug(canon(l)), canon(l));
  }
  console.log(`\nTagged ${list.length - left}/${list.length}; ${names.size} standard topics; ${Object.keys(state.canon).length} names merged.`);
  const mains = new Map();
  for (const v of Object.values(state.q)) mains.set(canon(v.m), (mains.get(canon(v.m)) || 0) + 1);
  console.log('Most common main topics:', [...mains].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([l, n]) => `${l} ${n}`).join(', '));
  const judged = Object.values(state.pair);
  console.log(`Pairs judged ${judged.length}: linked ${judged.filter((v) => v === 1).length}.`);

  // DOH (HAAD) links checked by hand: how many the AI pipeline finds.
  const doh = list.filter(([, q]) => q.source === 'doh_haad').map(([id]) => id);
  const dohSet = new Set(doh);
  const gold = new Set();
  for (const id of doh) for (const o of Object.keys(all[id].similar || {})) if (dohSet.has(o) && all[id].key !== all[o].key) gold.add(id < o ? `${id}__${o}` : `${o}__${id}`);
  if (gold.size && doh.every((id) => state.q[id])) {
    const cand = new Set(candidates().map(([k]) => k));
    const inCand = [...gold].filter((k) => cand.has(k)).length;
    const yes = [...gold].filter((k) => state.pair[k] === 1).length;
    const judgedGold = [...gold].filter((k) => state.pair[k] !== undefined).length;
    const extra = Object.entries(state.pair).filter(([k, v]) => v === 1 && !gold.has(k) && k.split('__').every((x) => dohSet.has(x)));
    console.log(`DOH check: ${gold.size} links already in the app between DOH papers; ${inCand} among the candidates; ${judgedGold} judged, ${yes} confirmed by the AI; ${extra.length} new DOH links the AI adds.`);
    extra.slice(0, 25).forEach(([k]) => {
      const [a, b] = k.split('__');
      console.log(`  + ${clean(all[a].question).slice(0, 90)} → ${answerOf(all[a]).slice(0, 30)} || ${clean(all[b].question).slice(0, 90)} → ${answerOf(all[b]).slice(0, 30)}`);
    });
    [...gold].filter((k) => state.pair[k] === 0).slice(0, 15).forEach((k) => {
      const [a, b] = k.split('__');
      console.log(`  - ${clean(all[a].question).slice(0, 90)} → ${answerOf(all[a]).slice(0, 30)} || ${clean(all[b].question).slice(0, 90)} → ${answerOf(all[b]).slice(0, 30)}`);
    });
  }
  const sample = Number(value('sample', 60));
  const tagged = list.filter(([id]) => state.q[id]);
  const step = Math.max(1, Math.floor(tagged.length / sample));
  console.log('\nSample of tags:');
  tagged.filter((_, i) => i % step === 0).forEach(([id, q]) => {
    const v = state.q[id];
    console.log(`  T ${q.source} | ${[v.m, ...(v.t || [])].map(canon).join('; ')} | ${v.f} | ${clean(q.question).slice(0, 90)} → ${answerOf(q).slice(0, 30)}`);
  });
  const linked = Object.entries(state.pair).filter(([, v]) => v === 1);
  const lstep = Math.max(1, Math.floor(linked.length / sample));
  console.log('\nSample of links:');
  linked.filter((_, i) => i % lstep === 0).forEach(([k]) => {
    const [a, b] = k.split('__');
    if (all[a] && all[b]) console.log(`  L ${state.q[a]?.f} || ${state.q[b]?.f}`);
  });
}

// ------------------------------------------------------------------ write
if (phase === 'write') {
  const qtags = read('qtags');
  const updates = {};
  const index = {};
  for (const [id, q] of list) {
    if (isHand(q)) {
      for (const t of tagsOf(q)) (index[t.slug] ||= {})[id] = true;
      continue;
    }
    const v = state.q[id];
    if (!v) continue;
    const labels = [...new Map([v.m, ...(v.t || [])].map(canon).map((l) => [tagSlug(l), l]))].filter(([s]) => s);
    if (!labels.length) continue;
    updates[`quizqq/${id}/tags`] = Object.fromEntries(labels);
    updates[`quizqq/${id}/topic`] = labels[0][0];
    updates[`quizqq/${id}/tags_auto`] = '1';
    for (const [s] of labels) (index[s] ||= {})[id] = true;
  }
  for (const [slug, ids] of Object.entries(qtags)) for (const id of Object.keys(ids || {})) if (!index[slug]?.[id]) updates[`qtags/${slug}/${id}`] = null;
  for (const [slug, ids] of Object.entries(index)) for (const id of Object.keys(ids)) if (!qtags[slug]?.[id]) updates[`qtags/${slug}/${id}`] = true;
  let links = 0;
  for (const [k, v] of Object.entries(state.pair)) {
    const [a, b] = k.split('__');
    if (v !== 1 || !all[a] || !all[b] || all[a].similar?.[b]) continue;
    updates[`quizqq/${a}/similar/${b}`] = true;
    updates[`quizqq/${b}/similar/${a}`] = true;
    links += 1;
  }
  console.log(`\n${Object.keys(updates).length} paths to write; ${links} new similar links.`);
  if (!args.includes('--commit')) {
    fs.writeFileSync(path.join('.tmp', 'aitag-write.json'), JSON.stringify(updates));
    console.log('DRY RUN — add --commit to write.');
  } else {
    write(updates, 'aitag-write');
    console.log('Written.');
  }
}
console.log(`\n${calls} AI requests this run.`);
if (allSpent && calls < maxCalls) {
  console.log('Every model is out of quota for now.');
  process.exitCode = 3;
}
