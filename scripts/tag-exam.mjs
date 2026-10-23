// Writes standard topic tags (lib/topicTags.js) on the questions of an exam
// book, from a hand-checked tags file:
//
//   data/exams/tags/<book>.txt    "<paper>.<n> Main topic; Other tag; …" per line
//
// <paper> is the 0-based position of the paper in --papers, <n> the question's
// 1-based position in that paper's JSON. Each paper's questions are found in
// the database by their quiz title and question text.
//
//   node scripts/tag-exam.mjs --book doh_haad --tags data/exams/tags/doh-haad.txt \
//     --papers data/exams/tags/doh-haad-papers.json [--commit]
//
// --papers lists [{ "file": "data/exams/….json", "title": "<quiz title>" }].
// Re-running replaces the book's tags, and drops qtags entries it no longer has.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseTagLine } from '../src/lib/topicTags.js';

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const project = value('project') || 'easy-pedia';
const book = value('book');
const tagsFile = value('tags');
const papersFile = value('papers');
if (!book || !tagsFile || !papersFile) {
  console.error('Usage: node scripts/tag-exam.mjs --book <source> --tags <file.txt> --papers <papers.json> [--commit]');
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
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const papers = JSON.parse(fs.readFileSync(papersFile, 'utf8'));
const lines = fs
  .readFileSync(tagsFile, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const m = /^(\d+)\.(\d+)\s+(.*)$/.exec(l);
    if (!m) throw new Error(`Bad tags line: ${l}`);
    return { paper: Number(m[1]), n: Number(m[2]), tags: parseTagLine(m[3]) };
  });

console.log('Reading allquiz, quizqq and qtags…');
const quizzes = Object.values(read('allquiz')).filter((q) => q && q.source === book);
const all = read('quizqq');
const qtags = read('qtags');
const byQuiz = {};
for (const [id, q] of Object.entries(all)) {
  if (q && q.source === book) (byQuiz[q.key] ||= []).push([id, q]);
}

const idOf = {}; // "paper.n" → question id
let problems = 0;
papers.forEach((p, i) => {
  const quiz = quizzes.find((q) => String(q.title || '').trim() === p.title);
  if (!quiz) {
    console.log(`! no quiz "${p.title}"`);
    problems += 1;
    return;
  }
  const rows = (byQuiz[quiz.key] || []).sort(([a], [b]) => (a < b ? -1 : 1));
  const { questions } = JSON.parse(fs.readFileSync(p.file, 'utf8'));
  const free = new Map(rows.map(([id, q]) => [id, norm(q.question)]));
  questions.forEach((q, k) => {
    const want = norm(q.question);
    let hit = [...free].find(([, t]) => t === want)?.[0];
    if (!hit) hit = [...free].find(([, t]) => t.slice(0, 80) === want.slice(0, 80))?.[0];
    if (!hit) {
      console.log(`! ${i}.${k + 1} not found in "${p.title}": ${want.slice(0, 80)}`);
      problems += 1;
      return;
    }
    free.delete(hit);
    idOf[`${i}.${k + 1}`] = hit;
  });
  console.log(`  ${p.title}: ${questions.length} questions, ${rows.length} in the database`);
});

const updates = {};
const index = {};
let tagged = 0;
for (const l of lines) {
  const id = idOf[`${l.paper}.${l.n}`];
  if (!id) {
    console.log(`! ${l.paper}.${l.n} has tags but no question`);
    problems += 1;
    continue;
  }
  if (!l.tags.length) continue;
  updates[`quizqq/${id}/tags`] = Object.fromEntries(l.tags.map((t) => [t.slug, t.label]));
  updates[`quizqq/${id}/topic`] = l.tags[0].slug;
  for (const t of l.tags) {
    (index[t.slug] ||= new Set()).add(id);
    updates[`qtags/${t.slug}/${id}`] = true;
  }
  tagged += 1;
}
// Entries for this book's questions under tags they no longer carry.
const mine = new Set(Object.values(idOf));
let dropped = 0;
for (const [slug, ids] of Object.entries(qtags)) {
  for (const id of Object.keys(ids || {})) {
    if (mine.has(id) && !index[slug]?.has(id)) {
      updates[`qtags/${slug}/${id}`] = null;
      dropped += 1;
    }
  }
}

const counts = Object.entries(index).map(([s, ids]) => [s, ids.size]);
console.log(`\n${tagged} questions tagged with ${counts.length} distinct tags; ${dropped} stale index entries dropped.`);
console.log('Most used:', counts.sort((a, b) => b[1] - a[1]).slice(0, 15).map(([s, n]) => `${s} ${n}`).join(', '));
if (problems) {
  console.error(`\n${problems} problem(s) above; nothing written.`);
  process.exit(1);
}

const out = path.join('.tmp', `tags-${book}.json`);
fs.writeFileSync(out, JSON.stringify(updates));
if (!args.includes('--commit')) {
  console.log(`DRY RUN — payload at ${out}; add --commit to write.`);
  process.exit(0);
}
fb(['database:update', '/', JSON.stringify(out), '--project', project, '--force']);
console.log('Written.');
