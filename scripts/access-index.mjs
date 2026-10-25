// Rebuilds the lookup nodes the database rules use to enforce the quiz lock
// (src/lib/accessIndex.js): qkey, qbook and qset, from allquiz, mcqs and
// quizqq. Prints counts only: the workflow log is public.
//   node scripts/access-index.mjs [--commit]
// Without --commit it only prints what it would write.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { indexEntries } from '../src/lib/accessIndex.js';

const commit = process.argv.includes('--commit');
const project = 'easy-pedia';
const fb = (args) =>
  execFileSync('firebase', [...args, '--project', project], {
    encoding: 'utf8',
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
    maxBuffer: 1 << 30,
  });
fs.mkdirSync('.tmp', { recursive: true });
const read = (node) => {
  const out = path.join('.tmp', `index-${node}.json`);
  fb(['database:get', `/${node}`, '--output', out]);
  return JSON.parse(fs.readFileSync(out, 'utf8') || 'null') || {};
};

const books = read('mcqs');
const quizzes = read('allquiz');
const questions = read('quizqq');

const next = { qkey: {}, qbook: {}, qset: {} };
const add = (entries) => {
  for (const [p, v] of Object.entries(entries)) {
    if (v === null) continue;
    const [node, key, field] = p.split('/');
    if (field) (next[node][key] ||= {})[field] = v;
    else next[node][key] = v;
  }
};
for (const b of Object.values(books)) if (b?.source) add(indexEntries({ source: b.source, bank: b.main_category, group: b.group }));
for (const q of Object.values(quizzes)) if (q) add(indexEntries({ quizKey: q.key, source: q.source }));
let unindexed = 0;
for (const q of Object.values(questions)) {
  if (!q) continue;
  const e = indexEntries({ bchap: q.bchap, bsci: q.bsci });
  if ((q.bchap && !e[`qset/${q.bchap}`]) || (q.bsci && !q.bsci.endsWith('|') && !e[`qset/${q.bsci}`])) unindexed += 1;
  add(e);
  // A quiz whose allquiz record was lost still has its questions' key.
  if (q.key && q.source && !next.qkey[q.key]) add(indexEntries({ quizKey: q.key, source: q.source }));
}

for (const node of ['qkey', 'qbook', 'qset']) console.log(`${node}: ${Object.keys(next[node]).length} entries`);
console.log(`questions whose chapter or section name cannot be a key (open only with full access): ${unindexed}`);
if (!commit) process.exit(0);

for (const node of ['qkey', 'qbook', 'qset']) {
  const file = path.join('.tmp', `index-new-${node}.json`);
  fs.writeFileSync(file, JSON.stringify(next[node]));
  fb(['database:set', `/${node}`, file, '--force']);
  console.log(`wrote ${node}`);
}
