// Uploads MCQ quizzes from the per-subject workbooks.
//
// The flashcard side has one deck per subject; this is the same idea for the
// question banks. Each workbook's MCQs sheet becomes one quiz in `allquiz`,
// and its questions go into `quizqq` linked by the quiz's `key`.
//
// As with the deck uploader it reuses the app's OWN import code — pickSheet,
// parseRows, buildRecord — so a quiz uploaded from here is identical to one
// imported through the admin panel.
//
//   node scripts/upload-quizzes.mjs <folder> --source pastests
//       Dry run: says exactly what it would write, and writes nothing.
//
//   node scripts/upload-quizzes.mjs <folder> --source pastests --commit
//       Does it, as ONE atomic write.
//
//   --img <url>      cover image for the new quizzes
//   --preview        upload hidden, for checking before release
//   --only <title>   just one subject
//   --strip <prefix> filename prefix to drop when making the title (default TAS-)
//   --des <text>     description template; {title} is substituted
//   --undo <file>    remove exactly what a previous run created
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as XLSX from 'xlsx';
import { fieldForHeader, parseRows, importableItems, buildRecord } from '../src/lib/questionImport.js';
import { pickSheet } from '../src/lib/sheetPick.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};

const project = value('project') || 'easy-pedia';
const fb = (cmdArgs) =>
  execFileSync('firebase', cmdArgs, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
  });

// ---------------------------------------------------------------- push keys
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
let lastPushTime = 0;
const lastRandChars = [];
function pushKey() {
  let now = Date.now();
  const duplicateTime = now === lastPushTime;
  lastPushTime = now;
  const stamp = new Array(8);
  for (let i = 7; i >= 0; i -= 1) {
    stamp[i] = PUSH_CHARS.charAt(now % 64);
    now = Math.floor(now / 64);
  }
  let id = stamp.join('');
  if (!duplicateTime) {
    for (let i = 0; i < 12; i += 1) lastRandChars[i] = Math.floor(Math.random() * 64);
  } else {
    let i = 11;
    for (; i >= 0 && lastRandChars[i] === 63; i -= 1) lastRandChars[i] = 0;
    lastRandChars[i] += 1;
  }
  for (let i = 0; i < 12; i += 1) id += PUSH_CHARS.charAt(lastRandChars[i]);
  return id;
}

const outDir = path.join(process.cwd(), '.tmp');
fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- undo
const undoFile = value('undo');
if (undoFile) {
  const manifest = JSON.parse(fs.readFileSync(undoFile, 'utf8'));
  const removals = {};
  manifest.quizzes.forEach((q) => {
    removals[`allquiz/${q.id}`] = null;
    q.questionIds.forEach((qid) => {
      removals[`quizqq/${qid}`] = null;
    });
  });
  console.log(`Removing ${manifest.quizzes.length} quiz(zes) created on ${manifest.at}.`);
  if (!flag('commit')) {
    console.log('DRY RUN — add --commit to remove them.');
    process.exit(0);
  }
  const p = path.join(outDir, 'quiz-undo.json');
  fs.writeFileSync(p, JSON.stringify(removals));
  fb(['database:update', '/', JSON.stringify(p), '--project', project, '--force']);
  console.log('Removed.');
  process.exit(0);
}

// ---------------------------------------------------------------- read
const folder = args.find((a) => !a.startsWith('--') && fs.existsSync(a) && fs.statSync(a).isDirectory());
const source = value('source');
if (!folder || !source) {
  console.error('Usage: node scripts/upload-quizzes.mjs <folder of .xlsx> --source <book source> [--commit]');
  process.exit(1);
}
const only = value('only');
const preview = flag('preview') ? 'true' : 'false';
const uploader = value('uploader') || 'Dr. Qusay Mohamed';
// The quiz title comes from the filename, so each book says which prefix to
// drop and how to word the description.
const strip = value('strip') || 'TAS-';
const desTemplate = value('des') || 'TAS 2020 {title} paper';

console.log(`Reading the quizzes already in "${source}"…`);
const allQuiz = JSON.parse(fb(['database:get', '/allquiz', '--project', project]) || 'null') || {};
const existingTitles = new Set(
  Object.values(allQuiz)
    .filter((q) => q.source === source)
    .map((q) => String(q.title || '').trim().toLowerCase()),
);
console.log(`  ${existingTitles.size} quiz(zes) there now`);

// The cover: reuse whatever the book's existing quizzes use, so a new quiz does
// not stand out as the only one without a picture.
const sample = Object.values(allQuiz).find((q) => q.source === source && q.img);
const img = value('img') || sample?.img || '';

const files = fs
  .readdirSync(folder)
  .filter((f) => /\.xlsx$/i.test(f) && !/ALL-DECKS/i.test(f))
  .sort();

const plan = [];
for (const file of files) {
  const title = file
    .replace(new RegExp(`^${strip}`), '')
    .replace(/\.xlsx$/i, '')
    .replace(/-/g, ' ');
  if (only && title.toLowerCase() !== only.toLowerCase()) continue;
  const wb = XLSX.read(fs.readFileSync(path.join(folder, file)), { type: 'buffer', raw: false });
  const sheets = wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false }),
  }));
  const { best } = pickSheet(sheets, { fieldFor: fieldForHeader, required: ['question', 'answer'] });
  if (!best) {
    plan.push({ title, questions: [], note: 'no MCQ sheet' });
    continue;
  }
  const parsed = parseRows(best.rows, { existingQuestions: [] });
  const questions = importableItems(parsed.items);
  const broken = parsed.items.filter((i) => i.errors.length).length;
  plan.push({
    title,
    questions,
    broken,
    exists: existingTitles.has(title.toLowerCase()),
    note: existingTitles.has(title.toLowerCase()) ? 'already in this book' : '',
  });
}

const write = plan.filter((p) => p.questions.length && !p.exists);
const total = write.reduce((n, p) => n + p.questions.length, 0);

console.log('');
for (const p of plan) {
  const mark = p.exists ? 'skip ' : p.questions.length ? 'new  ' : 'skip ';
  console.log(
    `  ${mark} ${p.title.padEnd(20)} ${String(p.questions.length).padStart(4)} questions` +
      `${p.broken ? `  (${p.broken} rejected)` : ''}${p.note ? `  — ${p.note}` : ''}`,
  );
}
console.log(`\n${write.length} quiz(zes), ${total} question(s) to write.`);
console.log(`Cover image: ${img ? `${img.slice(0, 60)}…` : 'none'}`);
console.log(`Published: ${preview === 'false' ? 'yes' : 'no (preview only)'}`);
if (!write.length) process.exit(0);

// ---------------------------------------------------------------- build
const updates = {};
const manifest = { at: new Date().toISOString(), source, project, quizzes: [] };
for (const p of write) {
  const quizId = pushKey(); // where the quiz record lives
  const key = pushKey(); // what its questions point at
  const quiz = {
    title: p.title,
    des: desTemplate.replace(/{title}/g, p.title),
    img,
    key,
    uploader,
    source,
    preview,
    number: String(p.questions.length),
    type: '',
    month: '',
    year: '',
  };
  updates[`allquiz/${quizId}`] = quiz;

  const questionIds = [];
  for (const item of p.questions) {
    const qid = pushKey();
    questionIds.push(qid);
    updates[`quizqq/${qid}`] = buildRecord(item, quiz);
  }
  manifest.quizzes.push({ id: quizId, key, title: p.title, questionIds });
}

const payload = path.join(outDir, 'quiz-upload.json');
fs.writeFileSync(payload, JSON.stringify(updates));
console.log(`Payload: ${Object.keys(updates).length} paths, ${(fs.statSync(payload).size / 1024 / 1024).toFixed(1)} MB`);

if (!flag('commit')) {
  console.log(`\nDRY RUN — nothing written. Payload left at ${payload}`);
  console.log('Add --commit to write it.');
  process.exit(0);
}

// ---------------------------------------------------------------- write
console.log('\nWriting…');
fb(['database:update', '/', JSON.stringify(payload), '--project', project, '--force']);
const manifestPath = path.join(outDir, 'quiz-upload-keys.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log(`Done: ${write.length} quiz(zes), ${total} question(s).`);
console.log(`To take it back out: node scripts/upload-quizzes.mjs --undo ${manifestPath} --commit`);
