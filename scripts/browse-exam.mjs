// Sorts a bank's questions into chapters and basic-science sections and writes
// the counts the browse screens read (qbrowse/<bank>), the same fields
// .tmp/link/browse.mjs writes for the older banks (lib/questionBrowse.js).
//
// A question with no category of its own takes the chapter most of its
// similar questions carry (quizqq/<id>/similar); otherwise the chapter is
// guessed from its text. The science comes from scienceOf.
//
//   node scripts/browse-exam.mjs --report                 how sorted each bank is, and an existing qbrowse record
//   node scripts/browse-exam.mjs --bank gulf_licensing [--commit]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { browseFields, chapterOf, normalizeChapter } from '../src/lib/questionBrowse.js';

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const project = value('project') || 'easy-pedia';
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
  const out = path.join('.tmp', `get-${node.replace(/\//g, '_')}.json`);
  fb(['database:get', `/${node}`, '--project', project, '--output', out]);
  return JSON.parse(fs.readFileSync(out, 'utf8') || 'null') || {};
};

console.log('Reading mcqs and quizqq…');
const books = Object.values(read('mcqs')).filter(Boolean);
const bankOf = new Map(books.map((b) => [b.source, b.main_category]));
const all = read('quizqq');

if (args.includes('--report')) {
  const rows = {};
  for (const q of Object.values(all)) {
    if (!q || q.question === undefined) continue;
    const bank = bankOf.get(q.source) || '?';
    const r = (rows[`${bank} / ${q.source}`] ||= { n: 0, unsorted: 0 });
    r.n += 1;
    if (!q.bchap || !q.bsci) r.unsorted += 1;
  }
  Object.entries(rows)
    .sort()
    .forEach(([k, r]) => console.log(`${String(r.n).padStart(6)} questions, ${String(r.unsorted).padStart(6)} unsorted  ${k}`));
  const qb = read('qbrowse');
  for (const [bank, rec] of Object.entries(qb)) {
    console.log(`qbrowse/${bank}: total ${rec?.total}, keys ${Object.keys(rec || {}).join(',')}, books ${Object.keys(rec?.books || {}).length}`);
  }
  const [bank, sample] = Object.entries(qb)[0] || [];
  if (sample) {
    const [bk, b] = Object.entries(sample.books || {})[0] || [];
    console.log(`sample qbrowse/${bank}/books/${bk}:`, JSON.stringify(b).slice(0, 600));
    console.log(`sample top level (no books):`, JSON.stringify({ ...sample, books: undefined }).slice(0, 600));
  }
  process.exit(0);
}

const bank = value('bank');
if (!bank) {
  console.error('Usage: node scripts/browse-exam.mjs --report | --bank <bank> [--commit]');
  process.exit(1);
}
const bankBooks = new Set(books.filter((b) => b.main_category === bank).map((b) => b.source));
console.log(`Bank ${bank}: books ${[...bankBooks].join(', ')}`);

// The chapter a question's similar questions agree on (their own category first).
const chapterOfOther = (o) => normalizeChapter(o?.category1) || normalizeChapter(o?.category2) || o?.chapter || '';
const votedChapter = (q) => {
  const votes = {};
  for (const id of Object.keys(q.similar || {})) {
    const c = chapterOfOther(all[id]);
    if (c && c !== 'Other') votes[c] = (votes[c] || 0) + 1;
  }
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : '';
};

const updates = {};
const empty = () => ({ total: 0, chapters: {}, science: {}, grid: {} });
const stats = { ...empty(), books: {} };
const add = (s, chapter, science) => {
  s.total += 1;
  s.chapters[chapter] = (s.chapters[chapter] || 0) + 1;
  s.science[science] = (s.science[science] || 0) + 1;
  s.grid[chapter] ||= {};
  s.grid[chapter][science] = (s.grid[chapter][science] || 0) + 1;
};
let changed = 0;
let voted = 0;
for (const [id, q] of Object.entries(all)) {
  if (!q || q.question === undefined || !bankBooks.has(q.source)) continue;
  const f = browseFields(q, bank);
  const own = normalizeChapter(q.category1) || normalizeChapter(q.category2);
  const v = own ? '' : votedChapter(q);
  if (v) {
    voted += 1;
    if (v !== chapterOf(q)) {
      f.chapter = v;
      f.bchap = `${bank}|${v}`;
    }
  }
  for (const k of ['chapter', 'science', 'bchap', 'bsci']) {
    if (q[k] !== f[k]) {
      updates[`quizqq/${id}/${k}`] = f[k];
      changed += 1;
    }
  }
  add(stats, f.chapter, f.science);
  add((stats.books[q.source] ||= empty()), f.chapter, f.science);
}
updates[`qbrowse/${bank}`] = stats;

console.log(`${stats.total} questions; chapter from similar questions for ${voted}; ${changed} fields change.`);
Object.entries(stats.chapters)
  .sort((a, b) => b[1] - a[1])
  .forEach(([c, n]) => console.log(`  ${String(n).padStart(4)}  ${c}`));
console.log('Sciences:', JSON.stringify(stats.science));

fs.mkdirSync('.tmp', { recursive: true });
const out = path.join('.tmp', `browse-${bank}.json`);
fs.writeFileSync(out, JSON.stringify(updates));
if (!args.includes('--commit')) {
  console.log(`DRY RUN — payload at ${out}; add --commit to write.`);
  process.exit(0);
}
fb(['database:update', '/', JSON.stringify(out), '--project', project, '--force']);
console.log('Written.');
