// The morning "Question of the day" (src/lib/dailyPick.js). When no daily
// question was posted today (Sudan time) it posts one picked from the bank;
// either way today's question is pushed to every phone once (`notified`).
// Prints ids and counts only: the workflow log is public.
//   node scripts/daily-question.mjs [--commit]
// Without --commit it only prints what it would post.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { dailyPush, dailyRecord, newPushKey, pickDaily, pushKeyTime, sudanDay } from '../src/lib/dailyPick.js';

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
const now = Date.now();

// One write for the question (when new) and its notification, so a question is
// never posted without its push or pushed twice.
const publish = (updates, what) => {
  console.log(what);
  if (!commit) return;
  const file = path.join('.tmp', 'daily-update.json');
  fs.writeFileSync(file, JSON.stringify(updates));
  fb(['database:update', '/', file, '--force']);
  console.log('written');
};
const notify = (dailyKey, q) => ({
  [`dailyquizz/${dailyKey}/notified`]: '1',
  [`push_outbox/${newPushKey(now)}`]: dailyPush(q, now),
});

const latest = read('dailyquizz', ['--order-by-key', '--limit-to-last', '1']);
const [lastKey, last] = Object.entries(latest)[0] || [];
if (lastKey && (last?.day === today || sudanDay(pushKeyTime(lastKey)) === today)) {
  if (last?.notified === '1') console.log(`${today}: today's question (${lastKey}) is already posted and sent`);
  else publish(notify(lastKey, last), `${today}: today's question (${lastKey}) is posted; sending its notification`);
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
const dailyKey = newPushKey(now);
publish(
  { [`dailyquizz/${dailyKey}`]: dailyRecord(id, q, today), ...notify(dailyKey, q) },
  `${today}: picked ${id} from ${entries.length} questions; posting and sending it`,
);
