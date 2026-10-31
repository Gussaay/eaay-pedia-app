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
  const out = path.join('.tmp', `get-${node}.json`);
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
fs.writeFileSync('.tmp/explain-images-undo.json', JSON.stringify(undo, null, 1));
console.log(`${Object.keys(updates).length / 2} questions to update, ${skipped} kept their own image, ${problems} problems.`);
if (problems) process.exit(1);
if (commit) {
  write(updates);
  console.log('Written.');
} else console.log('Dry run: nothing written (add --commit).');
