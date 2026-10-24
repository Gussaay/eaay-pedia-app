// Prints one bank's books (mcqs) and their quizzes (allquiz): titles, sources,
// counts and the fields that place them. Read only.
//   node scripts/list-bank.mjs --bank mrcpch
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const project = value('project') || 'easy-pedia';
const bank = value('bank') || 'mrcpch';
fs.mkdirSync('.tmp', { recursive: true });
const read = (node) => {
  const out = path.join('.tmp', `get-${node}.json`);
  execFileSync('firebase', ['database:get', `/${node}`, '--project', project, '--output', out], {
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
  });
  return JSON.parse(fs.readFileSync(out, 'utf8') || 'null') || {};
};

const cats = read('main_category');
console.log('== main_category');
for (const [k, c] of Object.entries(cats)) console.log(k, JSON.stringify({ ...c, img: undefined }));
const books = Object.entries(read('mcqs')).filter(([, b]) => b.main_category === bank);
const quizzes = Object.entries(read('allquiz'));
console.log(`\n== books in ${bank}: ${books.length}`);
for (const [k, b] of books) {
  const qs = quizzes.filter(([, q]) => q.source === b.source);
  const n = qs.reduce((s, [, q]) => s + (Number(q.number) || 0), 0);
  const { img, ...rest } = b;
  console.log(`\n# ${k} ${JSON.stringify(rest)} quizzes=${qs.length} questions=${n}`);
  for (const [qk, q] of qs) {
    console.log(`  - ${qk} | ${q.title} | n=${q.number} preview=${q.preview} key=${q.key} cat1=${q.category1 ?? ''} cat2=${q.category2 ?? ''}`);
  }
}
