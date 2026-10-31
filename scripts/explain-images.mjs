// Writes explanation images on DOH (HAAD) questions, from
// data/explain-images/images.json:
//
//   { "baseUrl": "https://easy-pedia.web.app/explain/",
//     "images": [{ "key", "file", "credit", "photo"?, "questions": ["<paper>#<n>", …] }] }
//
// <paper> is the part of data/exams/doh-haad-<paper>.json, <n> the question's
// 1-based position in it. Each question is found in the database the same way
// scripts/tag-exam.mjs finds it: by its quiz title (data/exams/tags/
// doh-haad-papers.json) and its question text.
//
// Sets quizqq/<id>/exp_img (baseUrl + file) and exp_img_credit. A question
// that already has a different explanation image is left alone and reported.
//
// The same image is then spread to what each of those questions links to:
//   - its "Same question" and "Similar" questions in any bank (quizqq/<id>/same,
//     similar), as their explanation image, when they have none;
//   - its linked flashcards and mnemonics (card_links, mnem_links), as the
//     picture under the answer (flashcard_items/<deck>/<card>/back_img +
//     back_img_credit), only on cards with a written answer and no picture or
//     drawing of their own.
// "Linked" (related) questions are a different point, so they are not touched.
//
//   node scripts/explain-images.mjs [--commit]
//       Without --commit: says what it would write, and writes nothing.
//       The undo record (old values) is saved to .tmp/explain-images-undo.json;
//   node scripts/explain-images.mjs --undo .tmp/explain-images-undo.json --commit
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const project = value('project') || 'easy-pedia';
const book = 'doh_haad';
const fb = (cmdArgs) =>
  execFileSync('firebase', cmdArgs, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
  });
fs.mkdirSync('.tmp', { recursive: true });
const read = (node) => {
  const out = path.join('.tmp', `get-${node.replace(/[^\w-]/g, '_')}.json`);
  fb(['database:get', `/${node}`, '--project', project, '--output', out]);
  return JSON.parse(fs.readFileSync(out, 'utf8') || 'null') || {};
};
const write = (updates) => {
  const p = path.join('.tmp', 'explain-images-write.json');
  fs.writeFileSync(p, JSON.stringify(updates));
  fb(['database:update', '/', JSON.stringify(p), '--project', project, '--force']);
};

const undoFile = value('undo');
if (undoFile) {
  const updates = JSON.parse(fs.readFileSync(undoFile, 'utf8'));
  console.log(`Undo: ${Object.keys(updates).length} paths`);
  if (commit) write(updates);
  process.exit(0);
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const { baseUrl, images } = JSON.parse(fs.readFileSync('data/explain-images/images.json', 'utf8'));
const papers = JSON.parse(fs.readFileSync('data/exams/tags/doh-haad-papers.json', 'utf8'));

console.log('Reading allquiz and quizqq…');
const quizzes = Object.values(read('allquiz')).filter((q) => q && q.source === book);
const all = read('quizqq');
const byQuiz = {};
for (const [id, q] of Object.entries(all)) if (q && q.source === book) (byQuiz[q.key] ||= []).push([id, q]);

const cache = {};
function findId(ref) {
  const [paper, n] = ref.split('#');
  const file = `data/exams/doh-haad-${paper}.json`;
  const p = papers.find((x) => x.file === file);
  if (!p) throw new Error(`${ref}: ${file} is not in doh-haad-papers.json`);
  if (!cache[file]) {
    const quiz = quizzes.find((q) => String(q.title || '').trim() === p.title);
    if (!quiz) throw new Error(`${ref}: no quiz titled "${p.title}"`);
    cache[file] = {
      rows: (byQuiz[quiz.key] || []).map(([id, q]) => [id, norm(q.question)]),
      questions: JSON.parse(fs.readFileSync(file, 'utf8')).questions,
    };
  }
  const { rows, questions } = cache[file];
  const q = questions[Number(n) - 1];
  if (!q) throw new Error(`${ref}: no question ${n} in ${file}`);
  const want = norm(q.question);
  const hit = rows.find(([, t]) => t === want) || rows.find(([, t]) => t.slice(0, 80) === want.slice(0, 80));
  if (!hit) throw new Error(`${ref}: question not found in "${p.title}": ${want.slice(0, 80)}`);
  return hit[0];
}

const updates = {};
const undo = {};
let problems = 0;
let skipped = 0;
for (const im of images) {
  const url = baseUrl + im.file;
  for (const ref of im.questions) {
    let id;
    try {
      id = findId(ref);
    } catch (e) {
      console.log(`! ${e.message}`);
      problems += 1;
      continue;
    }
    const cur = all[id] || {};
    if (cur.exp_img && cur.exp_img !== url && !String(cur.exp_img).startsWith(baseUrl)) {
      console.log(`- ${ref} (${id}) keeps its own image ${cur.exp_img}`);
      skipped += 1;
      continue;
    }
    updates[`quizqq/${id}/exp_img`] = url;
    updates[`quizqq/${id}/exp_img_credit`] = im.credit;
    undo[`quizqq/${id}/exp_img`] = cur.exp_img || null;
    undo[`quizqq/${id}/exp_img_credit`] = cur.exp_img_credit || null;
    console.log(`  ${ref} (${id}) -> ${im.file}`);
  }
}
// ---------------------------------------------------------------- spread
const keysOf = (v) => (v && typeof v === 'object' ? Object.keys(v).filter((k) => v[k]) : []);
const direct = Object.keys(updates)
  .filter((k) => k.endsWith('/exp_img'))
  .map((k) => k.split('/')[1]);
let spreadQ = 0;
let spreadCards = 0;
const cardSeen = new Set();
for (const id of direct) {
  const url = updates[`quizqq/${id}/exp_img`];
  const credit = updates[`quizqq/${id}/exp_img_credit`];
  const src = all[id] || {};
  for (const other of [...keysOf(src.same), ...keysOf(src.similar)]) {
    if (updates[`quizqq/${other}/exp_img`]) continue; // already set (directly or by another)
    const o = all[other];
    if (!o) continue;
    if (o.exp_img && !String(o.exp_img).startsWith(baseUrl)) continue;
    updates[`quizqq/${other}/exp_img`] = url;
    updates[`quizqq/${other}/exp_img_credit`] = credit;
    undo[`quizqq/${other}/exp_img`] = o.exp_img || null;
    undo[`quizqq/${other}/exp_img_credit`] = o.exp_img_credit || null;
    spreadQ += 1;
    console.log(`  + question ${other} (${o.source || '?'}) -> ${url.split('/').pop()}`);
  }
  for (const ref of [...keysOf(src.card_links), ...keysOf(src.mnem_links)]) {
    if (cardSeen.has(ref)) continue;
    cardSeen.add(ref);
    const [deck, card] = ref.split('~');
    if (!deck || !card) continue;
    const c = read(`flashcard_items/${deck}/${card}`);
    if (!c || !Object.keys(c).length) continue;
    const mine = String(c.back_img || '').startsWith(baseUrl);
    if ((c.back_img && !mine) || c.visual || !String(c.back || '').trim()) {
      console.log(`  - card ${ref} keeps its own picture`);
      continue;
    }
    updates[`flashcard_items/${deck}/${card}/back_img`] = url;
    updates[`flashcard_items/${deck}/${card}/back_img_credit`] = credit;
    undo[`flashcard_items/${deck}/${card}/back_img`] = c.back_img || null;
    undo[`flashcard_items/${deck}/${card}/back_img_credit`] = c.back_img_credit || null;
    spreadCards += 1;
    console.log(`  + card ${ref} "${String(c.front || '').slice(0, 60)}" -> ${url.split('/').pop()}`);
  }
}

fs.writeFileSync('.tmp/explain-images-undo.json', JSON.stringify(undo, null, 1));
console.log(`${direct.length} DOH questions, ${spreadQ} same/similar questions in other papers and banks, ${spreadCards} flashcards/mnemonics; ${skipped} kept their own image, ${problems} problems.`);
if (problems) process.exit(1);
if (commit) {
  write(updates);
  console.log('Written.');
} else console.log('Dry run: nothing written (add --commit).');
