// Posts the automatic "Question of the day" (src/lib/dailyPick.js) when no
// daily question was posted today (Sudan time). Prints ids and counts only:
// the workflow log is public.
//   node scripts/daily-question.mjs [--commit]
// Without --commit it only prints what it would post.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { dailyRecord, pickDaily, pushKeyTime, sudanDay } from '../src/lib/dailyPick.js';

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
const read = (node, extra = []) => {
  const out = path.join('.tmp', `daily-${node}.json`);
  fb(['database:get', `/${node}`, ...extra, '--output', out]);
  return JSON.parse(fs.readFileSync(out, 'utf8') || 'null') || {};
};

const today = sudanDay();
const latest = read('dailyquizz', ['--order-by-key', '--limit-to-last', '1']);
const [lastKey, last] = Object.entries(latest)[0] || [];
if (lastKey && (last?.day === today || sudanDay(pushKeyTime(lastKey)) === today)) {
  console.log(`${today}: a daily question is already posted (${lastKey}); nothing to do`);
  process.exit(0);
}

// Questions of preview quizzes are not counted on the main page either.
const quizzes = read('allquiz');
const preview = new Set(Object.values(quizzes).filter((q) => q && String(q.preview) === 'true').map((q) => q.key));
const entries = Object.entries(read('quizqq')).filter(([, q]) => q && !preview.has(q.key));
const pick = pickDaily(entries, today);
if (!pick) {
  console.log(`${today}: no usable question found in ${entries.length}`);
  process.exit(1);
}
const [id, q] = pick;
console.log(`${today}: picked ${id} from ${entries.length} questions`);
if (!commit) process.exit(0);

const file = path.join('.tmp', 'daily-new.json');
fs.writeFileSync(file, JSON.stringify(dailyRecord(id, q, today)));
fb(['database:push', '/dailyquizz', file]);
console.log('posted');
