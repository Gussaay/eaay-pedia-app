// Puts a bank's books into groups (lib/bookGroups.js): writes the group names
// to the bank record (main_category/<key>/groups) and each book's `group`
// field (mcqs/<key>/group). Nothing else changes: book sources, quizzes,
// questions, tags, links and unlocks all stay as they are.
//
//   node scripts/group-books.mjs data/groups/mrcpch.json [--commit]
//   node scripts/group-books.mjs --undo .tmp/group-<bank>.json --commit
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
const read = (node) => {
  const out = path.join('.tmp', `get-${node.replace(/\//g, '_')}.json`);
  fb(['database:get', `/${node}`, '--output', out]);
  return JSON.parse(fs.readFileSync(out, 'utf8') || 'null');
};
const write = (node, value) => {
  const file = path.join('.tmp', 'value.json');
  fs.writeFileSync(file, JSON.stringify(value));
  if (value === null) fb(['database:remove', `/${node}`, '--force']);
  else fb(['database:set', `/${node}`, file, '--force']);
};

let writes;
let bank;
if (undoAt !== -1) {
  ({ bank, writes } = JSON.parse(fs.readFileSync(args[undoAt + 1], 'utf8')));
  writes = writes.map((w) => ({ node: w.node, value: w.was, was: w.value }));
} else {
  const plan = JSON.parse(fs.readFileSync(args.find((a) => !a.startsWith('--')), 'utf8'));
  bank = plan.bank;
  const cats = Object.entries(read('main_category') || {}).filter(([, c]) => c.source === bank);
  if (cats.length !== 1) throw new Error(`Expected one main_category with source ${bank}, found ${cats.length}`);
  const books = Object.entries(read('mcqs') || {}).filter(([, b]) => b.main_category === bank);
  writes = [{ node: `main_category/${cats[0][0]}/groups`, value: plan.groups, was: cats[0][1].groups ?? null }];
  for (const [source, group] of Object.entries(plan.books)) {
    const hits = books.filter(([, b]) => b.source === source);
    if (hits.length !== 1) throw new Error(`Expected one book with source ${source} in ${bank}, found ${hits.length}`);
    const [key, b] = hits[0];
    writes.push({ node: `mcqs/${key}/group`, value: group, was: b.group ?? null, title: b.title });
  }
  const missed = books.filter(([, b]) => !(b.source in plan.books));
  for (const [, b] of missed) console.log(`not grouped: ${b.title} (${b.source})`);
}

for (const w of writes) console.log(`${commit ? 'write' : 'would write'} ${w.node} = ${JSON.stringify(w.value)}${w.title ? `  (${w.title})` : ''}`);
if (!commit) process.exit(0);
if (undoAt === -1) fs.writeFileSync(path.join('.tmp', `group-${bank}.json`), JSON.stringify({ bank, writes }, null, 2));
for (const w of writes) write(w.node, w.value);
console.log(`done: ${writes.length} writes`);
