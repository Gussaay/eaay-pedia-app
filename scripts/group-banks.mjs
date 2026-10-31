// Puts question banks into a main group on the MCQs page (lib/bookGroups.js
// groupBanks): writes main_category/<key>/group = the group's title. Nothing
// else changes: bank sources, books, quizzes, questions, unlocks and progress
// stay as they are.
//
//   node scripts/group-banks.mjs data/groups/banks.json [--commit]
//   node scripts/group-banks.mjs --undo .tmp/group-banks.json --commit
//
// Without --commit it only prints what it would write.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const undoAt = args.indexOf('--undo');
const project = 'easy-pedia';
const fb = (cmdArgs) =>
  execFileSync('firebase', [...cmdArgs, '--project', project], {
    encoding: 'utf8',
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
  });
fs.mkdirSync('.tmp', { recursive: true });

let writes;
if (undoAt !== -1) {
  ({ writes } = JSON.parse(fs.readFileSync(args[undoAt + 1], 'utf8')));
  writes = writes.map((w) => ({ ...w, value: w.was, was: w.value }));
} else {
  const plan = JSON.parse(fs.readFileSync(args.find((a) => !a.startsWith('--')), 'utf8'));
  const out = path.join('.tmp', 'get-main_category.json');
  fb(['database:get', '/main_category', '--output', out]);
  const cats = Object.entries(JSON.parse(fs.readFileSync(out, 'utf8') || 'null') || {});
  writes = [];
  for (const [group, sources] of Object.entries(plan.groups)) {
    for (const source of sources) {
      const hits = cats.filter(([, c]) => c.source === source);
      if (hits.length !== 1) throw new Error(`Expected one main_category with source ${source}, found ${hits.length}`);
      const [key, c] = hits[0];
      writes.push({ node: `main_category/${key}/group`, value: group, was: c.group ?? null, title: c.title });
    }
  }
}

for (const w of writes) console.log(`${commit ? 'write' : 'would write'} ${w.node} = ${JSON.stringify(w.value)}  (${w.title})`);
if (!commit) process.exit(0);
if (undoAt === -1) fs.writeFileSync(path.join('.tmp', 'group-banks.json'), JSON.stringify({ writes }, null, 2));
const file = path.join('.tmp', 'value.json');
for (const w of writes) {
  if (w.value === null) fb(['database:remove', `/${w.node}`, '--force']);
  else {
    fs.writeFileSync(file, JSON.stringify(w.value));
    fb(['database:set', `/${w.node}`, file, '--force']);
  }
}
console.log(`done: ${writes.length} writes`);
