// Builds the OSPE image cards (ospe/cards/<id>) from pictures already in the
// database: explanation / question pictures on quizqq, and the front / back
// pictures on ordinary flashcards. Mnemonic cards are left out (they are drawn
// memory aids, not identification pictures). One picture = one card, whichever
// questions and cards show it (ospeId of the url); every place it appears is
// kept as a source.
//
//   node scripts/ospe-seed.mjs                  dry run: writes .tmp/ospe-report.md
//                                               and .tmp/ospe-cards.json, changes nothing
//   node scripts/ospe-seed.mjs --commit         writes the cards, and the undo record
//                                               .tmp/ospe-undo.json (old values)
//   node scripts/ospe-seed.mjs --no-ai          no captions from the AI (quick check)
//   node scripts/ospe-seed.mjs --fixture f.json read a small database-shaped json
//                                               instead of the database (no writes)
//   node scripts/ospe-seed.mjs --undo .tmp/ospe-undo.json --commit
//
// Captions:
//   - the 64 hand-checked pictures in data/explain-images/images.json become
//     'checked' cards (once an entry has title + caption + kind);
//   - other new cards get a caption from Groq written ONLY from the question's
//     own text (captionPrompt in functions/ospeCore.js): 'auto' when the model
//     says the text names the picture, else 'waiting' for a person to look at.
// A card that is already 'checked' or already has a caption keeps its title,
// caption and status; it only gains sources.
//
// Needs FIREBASE_SERVICE_ACCOUNT (the database) and GROQ_API_KEY (captions).
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { restDb } from './rtdb-rest.mjs';
import { ospeId } from '../functions/ospeId.js';
import { mergeSource, questionSourceLabel, captionPrompt, parseCaptionReply, OSPE_KINDS } from '../functions/ospeCore.js';
import { normalizeChapter } from '../src/lib/questionBrowse.js';

const DATABASE_URL = 'https://easy-pedia.firebaseio.com';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = process.env.GROQ_MODEL ? [process.env.GROQ_MODEL] : ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
const CHUNK = 200; // paths per database write
const GAP_MS = 500; // ~2 requests a second to Groq

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const commit = flag('commit');
const noAi = flag('no-ai');
const fixtureFile = value('fixture');
const undoFile = value('undo');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const isUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim());
const tagSlug = (label) =>
  String(label || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ------------------------------------------------------------------ database
let db = null;
if (!fixtureFile) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.error('FIREBASE_SERVICE_ACCOUNT is not set.');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(raw);
  initializeApp({ credential: cert(serviceAccount) });
  db = restDb(DATABASE_URL, serviceAccount);
}

async function writeAll(updates) {
  if (!db) throw new Error('No database (fixture mode): nothing can be written.');
  const paths = Object.keys(updates);
  for (let i = 0; i < paths.length; i += CHUNK) {
    const part = {};
    for (const p of paths.slice(i, i + CHUNK)) part[p] = updates[p];
    await db.updateRoot(part);
    console.log(`  written ${Math.min(i + CHUNK, paths.length)}/${paths.length}`);
  }
}

fs.mkdirSync('.tmp', { recursive: true });

if (undoFile) {
  const updates = JSON.parse(fs.readFileSync(undoFile, 'utf8'));
  console.log(`Undo: ${Object.keys(updates).length} paths`);
  if (commit) {
    await writeAll(updates);
    console.log('Undone.');
  } else console.log('Dry run: nothing written (add --commit).');
  process.exit(0);
}

const fixture = fixtureFile ? JSON.parse(fs.readFileSync(fixtureFile, 'utf8')) : null;
const read = async (node) => {
  if (fixture) return node.split('/').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), fixture) || {};
  return (await db.get(node)) || {};
};

// -------------------------------------------------------------------- reading
console.log('Reading the database…');
const [quizqq, allquiz, mcqs, mainCategory, flashdecks, flashbooks, flashcategory, flashItems, existing] = await Promise.all(
  ['quizqq', 'allquiz', 'mcqs', 'main_category', 'flashdecks', 'flashbooks', 'flashcategory', 'flashcard_items', 'ospe/cards'].map(read),
);

const withKey = (obj) => Object.entries(obj).filter(([, v]) => v && typeof v === 'object').map(([k, v]) => ({ _key: k, ...v }));
const quizList = withKey(allquiz);
const bookList = withKey(mcqs);
const bankList = withKey(mainCategory);
const quizOf = (key) => quizList.find((z) => z.key === key || z._key === key);
const bookOfSource = (source) => bookList.find((b) => b.source === source);

// Position of each question in its quiz: by database key, as scripts/tag-exam.mjs does.
const byQuiz = {};
for (const [id, q] of Object.entries(quizqq)) if (q && q.key) (byQuiz[q.key] ||= []).push(id);
const position = {};
for (const ids of Object.values(byQuiz)) ids.sort().forEach((id, i) => (position[id] = i + 1));

function questionLabel(q, n) {
  const book = bookOfSource(q.source);
  const bank = book ? bankList.find((c) => c.source === book.main_category) : null;
  const group = clean(book?.group);
  const quiz = quizOf(q.key);
  return questionSourceLabel({
    bank: bank?.title || book?.main_category,
    group: group && (bank?.groups?.[group]?.title || group),
    book: book?.title,
    quiz: quiz?.title || q.title || q.quiztitle,
    n,
  });
}

// The correct option's text for a question: its `answer` is a letter a-e.
const correctText = (q) => {
  const letter = String(q.answer || '').toLowerCase().replace(/[^a-e]/g, '')[0];
  return letter ? clean(q[letter]) || letter.toUpperCase() : '';
};

// ------------------------------------------------------------ hand-checked set
const { baseUrl, images: handImages } = JSON.parse(fs.readFileSync('data/explain-images/images.json', 'utf8'));
const hand = new Map();
for (const im of handImages || []) hand.set(ospeId(baseUrl + im.file), im);

// ----------------------------------------------------------------- collecting
const now = Date.now();
// id -> { card (merged), prompts: first text source for the AI, isNew }
const work = new Map();
const touch = (img, add, text) => {
  const id = ospeId(img);
  if (!id) return;
  let w = work.get(id);
  if (!w) {
    const old = existing[id] || null;
    w = { id, old, card: old, text: null, credit: '' };
    work.set(id, w);
  }
  w.card = mergeSource(w.card, { img, now, ...add });
  if (!w.text && text) w.text = text;
  if (add.credit && !w.credit) w.credit = add.credit;
};

let qPics = 0;
for (const [qid, q] of Object.entries(quizqq)) {
  if (!q || typeof q !== 'object') continue;
  for (const field of ['exp_img', 'question_img']) {
    if (!isUrl(q[field])) continue;
    qPics += 1;
    const n = position[qid];
    const src = { type: 'q', qid, ...(q.key ? { quiz: q.key } : {}), ...(n ? { n } : {}), label: questionLabel(q, n) };
    touch(
      q[field].trim(),
      { src, field, chapter: normalizeChapter(q.chapter), topic: q.topic || '', topic_label: (q.topic && q.tags?.[q.topic]) || '', credit: field === 'exp_img' ? clean(q.exp_img_credit) : '' },
      { stem: q.question, answer: correctText(q), explanation: q.exp, field },
    );
  }
}

// Mnemonic books: a deck is one when its book sits under a category with kind 'mnemonic'
// (src/lib/mnemonics.js), or the deck itself says so.
const catList = withKey(flashcategory);
const mnemCats = new Set(catList.filter((c) => c.kind === 'mnemonic').map((c) => c.source));
const flashBookList = withKey(flashbooks);
const mnemBooks = new Set(flashBookList.filter((b) => mnemCats.has(b.main_category)).map((b) => b.source));
let fPics = 0;
let mnemSkipped = 0;
for (const deck of withKey(flashdecks)) {
  const deckId = deck._key;
  const book = flashBookList.find((b) => b.source === deck.source);
  const isMnem = mnemBooks.has(deck.source) || deck.kind === 'mnemonic';
  for (const [cardId, c] of Object.entries(flashItems[deckId] || {})) {
    if (!c || typeof c !== 'object') continue;
    const fields = ['img', 'back_img'].filter((f) => isUrl(c[f]));
    if (!fields.length) continue;
    if (isMnem || c.visual) {
      mnemSkipped += fields.length;
      continue;
    }
    for (const field of fields) {
      fPics += 1;
      const src = { type: 'card', deck: deckId, card: cardId, label: ['Flashcards', clean(book?.title), clean(deck.title)].filter(Boolean).join(' › ') };
      touch(
        c[field].trim(),
        { src, field, chapter: normalizeChapter(c.chapter || deck.chapter), topic: '', topic_label: '', credit: field === 'back_img' ? clean(c.back_img_credit) : '' },
        { stem: c.front, answer: c.back, explanation: '', field },
      );
    }
  }
}
console.log(`${qPics} question pictures, ${fPics} flashcard pictures, ${mnemSkipped} mnemonic pictures skipped -> ${work.size} distinct pictures.`);

// -------------------------------------------------------------------- captions
async function groq(prompt) {
  const key = process.env.GROQ_API_KEY;
  for (const model of GROQ_MODELS) {
    for (let attempt = 0; attempt < 4; attempt++) {
      let res;
      try {
        res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
            max_tokens: 400,
          }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        await sleep(2000);
        continue;
      }
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after')) || 2 ** attempt * 2;
        await sleep(Math.min(wait, 30) * 1000);
        continue;
      }
      if (!res.ok) break; // try the next model
      const j = await res.json();
      return j.choices?.[0]?.message?.content || '';
    }
  }
  return null;
}

const keep = (w) => w.old && (w.old.status === 'checked' || clean(w.old.caption));
let aiOk = 0;
let aiNo = 0;
let aiFail = 0;
for (const w of work.values()) {
  const im = hand.get(w.id);
  const c = w.card;
  if (keep(w)) continue; // existing caption/status stay
  if (im && clean(im.title) && clean(im.caption)) {
    w.card = {
      ...c,
      title: clean(im.title),
      caption: clean(im.caption),
      kind: OSPE_KINDS.some((k) => k.key === im.kind) ? im.kind : 'other',
      chapter: normalizeChapter(im.chapter) || c.chapter,
      credit: clean(im.credit) || 'Easy Pedia drawing',
      status: 'checked',
    };
    continue;
  }
  if (im) w.card = { ...c, credit: clean(im.credit) || 'Easy Pedia drawing' };
  else if (w.credit && !c.credit) w.card = { ...c, credit: w.credit };
  if (im || noAi || !w.text) continue; // stays 'waiting'
  if (!process.env.GROQ_API_KEY) {
    aiFail += 1;
    continue;
  }
  const reply = await groq(captionPrompt(w.text));
  await sleep(GAP_MS);
  const r = reply == null ? null : parseCaptionReply(reply);
  if (!r) {
    aiFail += 1;
    continue;
  }
  if (!r.ok) {
    aiNo += 1;
    continue;
  }
  aiOk += 1;
  const topicFix = w.card.topic ? {} : { topic: tagSlug(r.title), topic_label: r.title };
  w.card = { ...w.card, ...topicFix, title: r.title, caption: r.caption, kind: r.kind, status: 'auto' };
}
if (!noAi) console.log(`AI captions: ${aiOk} auto, ${aiNo} said the text does not name the picture, ${aiFail} failed.`);

// --------------------------------------------------------------------- results
const cards = {};
const undo = {};
for (const w of work.values()) {
  if (JSON.stringify(w.card) === JSON.stringify(w.old)) continue;
  cards[w.id] = w.card;
  undo[`ospe/cards/${w.id}`] = w.old || null;
}
fs.writeFileSync('.tmp/ospe-cards.json', JSON.stringify(cards, null, 1));
fs.writeFileSync('.tmp/ospe-undo.json', JSON.stringify(undo, null, 1));

const list = Object.entries(cards);
const count = (fn) => {
  const m = {};
  for (const [, c] of list) m[fn(c)] = (m[fn(c)] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
const firstLabel = (c) => Object.values(c.sources || {})[0]?.label || '';
const esc = (t) => String(t || '').replace(/\|/g, '/');
const out = [];
out.push('# OSPE seed report', '');
out.push(`Mode: ${commit ? 'commit' : 'dry run'}${noAi ? ', no AI' : ''}${fixtureFile ? ', fixture' : ''}`, '');
out.push('## Totals', '');
out.push(`- Question pictures found: ${qPics}`);
out.push(`- Flashcard pictures found: ${fPics} (mnemonic pictures skipped: ${mnemSkipped})`);
out.push(`- Distinct pictures: ${work.size}`);
out.push(`- Cards to write: ${list.length} (${list.filter(([id]) => !existing[id]).length} new, ${list.filter(([id]) => existing[id]).length} existing gaining sources or credit)`);
for (const [s, n] of count((c) => c.status)) out.push(`- Status ${s}: ${n}`);
out.push('', '## By chapter', '');
for (const [k, n] of count((c) => c.chapter || '(none)')) out.push(`- ${k}: ${n}`);
out.push('', '## By kind', '');
for (const [k, n] of count((c) => c.kind)) out.push(`- ${k}: ${n}`);
out.push('', '## Cards', '', '| Title | Status | Chapter | First source |', '|---|---|---|---|');
for (const [, c] of list.sort((a, b) => String(a[1].title).localeCompare(String(b[1].title)))) {
  out.push(`| ${esc(c.title) || '(no title)'} | ${c.status} | ${esc(c.chapter)} | ${esc(firstLabel(c))} |`);
}
const waiting = list.filter(([, c]) => c.status === 'waiting');
out.push('', `## Waiting for a person (${waiting.length})`, '');
for (const [id, c] of waiting) out.push(`- ${id} ${c.img} — ${firstLabel(c)} (${Object.keys(c.sources || {}).length} source${Object.keys(c.sources || {}).length === 1 ? '' : 's'})`);
fs.writeFileSync('.tmp/ospe-report.md', `${out.join('\n')}\n`);
console.log(`Report: .tmp/ospe-report.md; ${list.length} cards in .tmp/ospe-cards.json.`);

if (commit) {
  if (fixtureFile) {
    console.error('--fixture never writes to the database.');
    process.exit(1);
  }
  const updates = {};
  for (const [id, c] of list) updates[`ospe/cards/${id}`] = c;
  await writeAll(updates);
  console.log('Written.');
} else console.log('Dry run: nothing written (add --commit).');
