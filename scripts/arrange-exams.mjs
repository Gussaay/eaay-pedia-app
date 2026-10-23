// Puts the quizzes of one book in exam-date order and gives each a dated title.
//
// The Exams page lists a book's quizzes newest push key first, so the order is
// set by re-keying: every quiz of the book is written again under a fresh push
// key, oldest exam first, and the old record removed. The record's own `key`
// (which links its questions) is kept, so the questions do not move.
//
//   node scripts/arrange-exams.mjs --book doh_haad --order data/exams/doh-haad-order.json [--commit]
//
// The order file lists the quizzes newest first:
//   [{ "title": "May 2024", "was": ["old title"], "month": "05", "year": "2024" }, …]
// A quiz is found by its title or any of its old titles. A rename is also written
// to the title its questions carry. A quiz whose answers are mostly one letter has
// its options shuffled (the keyed answer moves with them). Re-running is safe: when
// the keys are already in order only the changed fields are written.
// The undo manifest is .tmp/arrange-<book>.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const project = value('project') || 'easy-pedia';
const book = value('book');
const orderFile = value('order');
if (!book || !orderFile) {
  console.error('Usage: node scripts/arrange-exams.mjs --book <source> --order <order.json> [--commit]');
  process.exit(1);
}
const fb = (cmdArgs) =>
  execFileSync('firebase', cmdArgs, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
  });
fs.mkdirSync('.tmp', { recursive: true });
// Through a file: a large node piped from the CLI can arrive cut short.
const read = (node) => {
  const out = path.join('.tmp', `get-${node}.json`);
  fb(['database:get', `/${node}`, '--project', project, '--output', out]);
  return JSON.parse(fs.readFileSync(out, 'utf8') || 'null') || {};
};

// ---------------------------------------------------------------- push keys
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
let lastPushTime = 0;
const lastRandChars = [];
function pushKey() {
  let now = Date.now();
  const duplicateTime = now === lastPushTime;
  lastPushTime = now;
  const stamp = new Array(8);
  for (let i = 7; i >= 0; i -= 1) {
    stamp[i] = PUSH_CHARS.charAt(now % 64);
    now = Math.floor(now / 64);
  }
  let id = stamp.join('');
  if (!duplicateTime) {
    for (let i = 0; i < 12; i += 1) lastRandChars[i] = Math.floor(Math.random() * 64);
  } else {
    let i = 11;
    for (; i >= 0 && lastRandChars[i] === 63; i -= 1) lastRandChars[i] = 0;
    lastRandChars[i] += 1;
  }
  for (let i = 0; i < 12; i += 1) id += PUSH_CHARS.charAt(lastRandChars[i]);
  return id;
}

// Seeded so a dry run and the real run shuffle the same way.
const rng = (seed) => {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};
const LETTERS = ['a', 'b', 'c', 'd', 'e'];
const POSITIONAL = /above|none of|all of|both/i;

// ---------------------------------------------------------------- match
const norm = (s) => String(s || '').trim().toLowerCase();
const order = JSON.parse(fs.readFileSync(orderFile, 'utf8'));
const quizzes = Object.entries(read('allquiz')).filter(([, q]) => q && q.source === book);
const used = new Set();
const rows = order.map((o) => {
  const names = [o.title, ...(o.was || [])].map(norm);
  const hit = quizzes.find(([id, q]) => !used.has(id) && names.includes(norm(q.title)));
  if (!hit) throw new Error(`No quiz "${o.title}" in ${book}`);
  used.add(hit[0]);
  return { o, id: hit[0], q: hit[1] };
});
const left = quizzes.filter(([id]) => !used.has(id));
if (left.length) throw new Error(`Not in the order file: ${left.map(([, q]) => `"${q.title}"`).join(', ')}`);

const inOrder = rows.every((r, i) => i === 0 || r.id < rows[i - 1].id);
const updates = {};
const manifest = { at: new Date().toISOString(), project, book, rekeyed: {}, records: {}, questions: {} };

const quizqq = read('quizqq');
for (const r of rows.slice().reverse()) {
  const next = { ...r.q, title: r.o.title, month: r.o.month || r.q.month || '', year: r.o.year || r.q.year || '' };
  if (r.o.des) next.des = r.o.des;
  const newId = inOrder ? r.id : pushKey();
  manifest.records[r.id] = r.q;
  if (newId !== r.id) {
    manifest.rekeyed[r.id] = newId;
    updates[`allquiz/${newId}`] = next;
    updates[`allquiz/${r.id}`] = null;
  } else {
    for (const f of ['title', 'month', 'year', 'des']) if (next[f] !== r.q[f]) updates[`allquiz/${r.id}/${f}`] = next[f];
  }

  const qs = Object.entries(quizqq)
    .filter(([, x]) => x && x.source === book && x.key === r.q.key)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const counts = {};
  qs.forEach(([, x]) => (counts[x.answer] = (counts[x.answer] || 0) + 1));
  const skewed = qs.length >= 10 && Math.max(...Object.values(counts)) > qs.length / 2;
  const rand = rng(r.o.title);
  let shuffled = 0;
  for (const [qid, x] of qs) {
    if (x.title !== r.o.title) updates[`quizqq/${qid}/title`] = r.o.title;
    if (!skewed) continue;
    const opts = LETTERS.map((l) => x[l]).filter((v) => v && String(v).trim());
    if (opts.length < 2 || opts.some((v) => POSITIONAL.test(v)) || !LETTERS.includes(x.answer)) continue;
    const right = x[x.answer];
    for (let i = opts.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    manifest.questions[qid] = Object.fromEntries([...LETTERS, 'answer', 'title'].map((l) => [l, x[l] ?? '']));
    LETTERS.forEach((l, i) => (updates[`quizqq/${qid}/${l}`] = opts[i] || ''));
    updates[`quizqq/${qid}/answer`] = LETTERS[opts.indexOf(right)];
    shuffled += 1;
  }
  console.log(
    `${newId === r.id ? 'kept ' : 're-key'}  ${r.q.title === r.o.title ? r.o.title : `"${r.q.title}" -> "${r.o.title}"`}` +
      `  (${qs.length} questions${shuffled ? `, ${shuffled} shuffled` : ''})`,
  );
}

const out = path.join('.tmp', `arrange-${book}.json`);
fs.writeFileSync(out, JSON.stringify(manifest, null, 1));
console.log(`\n${Object.keys(updates).length} writes. Undo manifest: ${out}`);
if (!args.includes('--commit')) {
  console.log('DRY RUN — nothing written; add --commit.');
  process.exit(0);
}
if (Object.keys(updates).length) {
  const p = path.join('.tmp', `arrange-${book}-updates.json`);
  fs.writeFileSync(p, JSON.stringify(updates));
  fb(['database:update', '/', JSON.stringify(p), '--project', project, '--force']);
}
console.log('Done.');
