// Links the questions of one book to similar questions, flashcards and
// mnemonics elsewhere in the app, the fields StudyLinks shows under an
// explanation:
//
//   quizqq/<id>/similar      { "<otherQuestionId>": true }   (written on both questions)
//   quizqq/<id>/card_links   { "<fDeck>~<fCard>": true }
//   quizqq/<id>/mnem_links   { "<mDeck>~<mCard>": true }
//
//   node scripts/link-exam.mjs --book doh_haad
//       Prints, for each question, the closest candidates by word overlap
//       (TF-IDF cosine) so a person can pick the real matches.
//
//   node scripts/link-exam.mjs --book doh_haad --apply <links.json> [--commit]
//       Writes the picked links. links.json is
//       { "<n>": { "similar": [ids], "cards": [refs], "mnemonics": [refs] } },
//       n being the question's 1-based position in the book (stable push-key order).
//
//   --quiz "<title>"  works on one quiz of the book only (positions count within
//                     that quiz), and lets the book's other quizzes be suggested
//                     as similar questions.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tagsOf } from '../src/lib/topicTags.js';

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const project = value('project') || 'easy-pedia';
const book = value('book');
if (!book) {
  console.error('Usage: node scripts/link-exam.mjs --book <source> [--apply links.json [--commit]]');
  process.exit(1);
}
const fb = (cmdArgs) =>
  execFileSync('firebase', cmdArgs, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
  });
// Through a file: a large node piped from the CLI can arrive cut short.
const read = (node) => {
  fs.mkdirSync('.tmp', { recursive: true });
  const out = path.join('.tmp', `get-${node}.json`);
  fb(['database:get', `/${node}`, '--project', project, '--output', out]);
  return JSON.parse(fs.readFileSync(out, 'utf8') || 'null') || {};
};

console.log('Reading quizqq…');
const all = read('quizqq');
const quizTitle = value('quiz');
let quizKey = null;
if (quizTitle) {
  const hit = Object.values(read('allquiz')).find(
    (q) => q && q.source === book && String(q.title || '').trim().toLowerCase() === quizTitle.trim().toLowerCase(),
  );
  if (!hit) throw new Error(`No quiz "${quizTitle}" in ${book}`);
  quizKey = hit.key;
}
const isMine = (q) => q && q.source === book && (!quizKey || q.key === quizKey);
const mine = Object.entries(all)
  .filter(([, q]) => isMine(q))
  .sort(([a], [b]) => (a < b ? -1 : 1));
console.log(`  ${mine.length} questions in ${book}${quizTitle ? ` / ${quizTitle}` : ''}`);

// ---------------------------------------------------------------- apply
const applyFile = value('apply');
if (applyFile) {
  const picks = JSON.parse(fs.readFileSync(applyFile, 'utf8'));
  const updates = {};
  let n = { similar: 0, cards: 0, mnemonics: 0 };
  for (const [pos, p] of Object.entries(picks)) {
    const hit = mine[Number(pos) - 1];
    if (!hit) throw new Error(`No question #${pos}`);
    const [id] = hit;
    for (const other of p.similar || []) {
      if (!all[other]) throw new Error(`#${pos}: quizqq/${other} does not exist`);
      updates[`quizqq/${id}/similar/${other}`] = true;
      updates[`quizqq/${other}/similar/${id}`] = true;
      n.similar += 1;
    }
    for (const ref of p.cards || []) {
      updates[`quizqq/${id}/card_links/${ref}`] = true;
      n.cards += 1;
    }
    for (const ref of p.mnemonics || []) {
      updates[`quizqq/${id}/mnem_links/${ref}`] = true;
      n.mnemonics += 1;
    }
  }
  console.log(`Links: ${n.similar} similar pairs, ${n.cards} flashcards, ${n.mnemonics} mnemonics (${Object.keys(updates).length} paths).`);
  if (!args.includes('--commit')) {
    console.log('DRY RUN — add --commit to write.');
    process.exit(0);
  }
  const outDir = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const p = path.join(outDir, 'exam-links.json');
  fs.writeFileSync(p, JSON.stringify(updates));
  fb(['database:update', '/', JSON.stringify(p), '--project', project, '--force']);
  console.log('Written.');
  process.exit(0);
}

// ---------------------------------------------------------------- candidates
console.log('Reading flashcards…');
const cats = Object.values(read('flashcategory'));
const books = Object.values(read('flashbooks'));
const decks = read('flashdecks');
const items = read('flashcard_items');
const mnemonicCats = new Set(cats.filter((c) => c.kind === 'mnemonic').map((c) => c.source));
const bookOf = new Map(books.map((b) => [b.source, b]));
const isMnemonicDeck = (d) => d?.kind === 'mnemonic' || mnemonicCats.has(bookOf.get(d?.source)?.main_category);

const STOP = new Set(
  'the and with for are was who what which that this from has have had his her him she they them their there than then into onto over under after before most least likely following your you not but all any can may will would should could does did been being also only each other some such very more less about between presented presents presenting present year years old month months week weeks day days child boy girl baby infant patient scenario ask asked regarding true correct statement diagnosis management investigation action next step'.split(' '),
);
const words = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .match(/[a-z][a-z0-9-]{2,}/g)
    ?.filter((w) => !STOP.has(w))
    .map((w) => w.replace(/(ies)$/, 'y').replace(/([^s])s$/, '$1')) || [];

const docs = [];
for (const [id, q] of Object.entries(all)) {
  if (!q || !q.question) continue;
  docs.push({ kind: isMine(q) ? 'mine' : 'q', id, tags: tagsOf(q), text: `${q.question} ${q[q.answer] || ''}`, label: `${q.source} | ${String(q.question).replace(/\s+/g, ' ').slice(0, 110)} → ${String(q[q.answer] || '').slice(0, 50)}` });
}
for (const [deckId, cards] of Object.entries(items)) {
  const kind = isMnemonicDeck(decks[deckId]) ? 'm' : 'c';
  for (const [cardId, c] of Object.entries(cards || {})) {
    if (!c) continue;
    const front = String(c.front || c.title || '').replace(/\s+/g, ' ');
    const back = String(c.back || '').replace(/\s+/g, ' ');
    docs.push({ kind, id: `${deckId}~${cardId}`, text: `${front} ${back}`, plain: `${front} ${back} ${c.tags || ''}`.toLowerCase(), label: `${decks[deckId]?.title || deckId} | ${front.slice(0, 90)} → ${back.slice(0, 70)}` });
  }
}

const df = new Map();
for (const d of docs) {
  d.tf = new Map();
  for (const w of words(d.text)) d.tf.set(w, (d.tf.get(w) || 0) + 1);
  for (const w of d.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
}
const N = docs.length;
for (const d of docs) {
  let norm = 0;
  d.vec = new Map();
  for (const [w, n] of d.tf) {
    const v = (1 + Math.log(n)) * Math.log(N / df.get(w));
    d.vec.set(w, v);
    norm += v * v;
  }
  d.norm = Math.sqrt(norm) || 1;
}
const cos = (a, b) => {
  let s = 0;
  for (const [w, v] of a.vec) {
    const u = b.vec.get(w);
    if (u) s += v * u;
  }
  return s / (a.norm * b.norm);
};

const pool = { q: docs.filter((d) => d.kind === 'q'), c: docs.filter((d) => d.kind === 'c'), m: docs.filter((d) => d.kind === 'm') };
console.log(`Pool: ${pool.q.length} questions, ${pool.c.length} flashcards, ${pool.m.length} mnemonic cards\n`);
// Standard topic tags (lib/topicTags.js) add to the wording match: a question
// sharing a tag, or a card naming the question's main topic, scores higher
// and is marked "#".
const TAG_BONUS = 0.2;
const tagBonus = (d, o) => {
  if (!d.tags?.length) return 0;
  if (o.tags) return o.tags.some((t) => d.tags.some((u) => u.slug === t.slug)) ? TAG_BONUS : 0;
  return o.plain?.includes(d.tags[0].label.toLowerCase()) ? TAG_BONUS * 0.75 : 0;
};
const top = (d, list, k, min) =>
  list
    .map((o) => ({ o, s: cos(d, o) + tagBonus(d, o), tag: tagBonus(d, o) > 0 }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s)
    .slice(0, k);

const byId = new Map(docs.map((d) => [d.id, d]));
// --compact: fewer, stronger candidates on shorter lines, for long books.
const compact = args.includes('--compact');
mine.forEach(([id], i) => {
  const d = byId.get(id);
  const show = (o) => (compact ? o.label.replace(/^[^|]*\| /, '').slice(0, 120) : o.label);
  console.log(`#${i + 1} ${show(d)}`);
  for (const { o, s, tag } of top(d, pool.q, compact ? 4 : 6, compact ? 0.25 : 0.18)) console.log(`  Q ${s.toFixed(2)}${tag ? '#' : ''} ${o.id} ${show(o)}`);
  for (const { o, s, tag } of top(d, pool.c, compact ? 3 : 5, compact ? 0.22 : 0.15)) console.log(`  C ${s.toFixed(2)}${tag ? '#' : ''} ${o.id} ${show(o)}`);
  for (const { o, s, tag } of top(d, pool.m, 2, compact ? 0.2 : 0.12)) console.log(`  M ${s.toFixed(2)}${tag ? '#' : ''} ${o.id} ${show(o)}`);
});
