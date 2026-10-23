// Uploads one exam paper from a JSON file into its own bank and book, creating
// the bank (main_category) and the book (mcqs) the first time.
//
// The questions are written as ordinary quizqq records — the same shape the
// admin import makes (buildRecord + browseFields) — so the paper shows up in
// Chapters, Science and Practice, and the offline linkers (similar questions,
// flashcards, mnemonics) treat it like any other quiz.
//
//   node scripts/upload-exam-json.mjs <file.json> --bank gulf --bank-title "Gulf Licensing Exams" \
//        --book doh_haad --book-title "DOH (HAAD)"
//       Dry run: says exactly what it would write, and writes nothing.
//
//   … --commit        does it, as ONE atomic write
//   --preview         upload the quiz hidden, for checking before release
//   --img <url>       cover image for the bank, book and quiz
//   --undo <file>     remove exactly what a previous run created
//
// The JSON is { title, des, questions: [{ question, a…e, answer, exp, exp_img, category1, category2 }] }.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRecord } from '../src/lib/questionImport.js';
import { browseFields } from '../src/lib/questionBrowse.js';
import { OPTION_KEYS } from '../src/lib/quiz.js';

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
const read = (node) => JSON.parse(fb(['database:get', `/${node}`, '--project', project]) || 'null') || {};

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

const write = (updates, name) => {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, JSON.stringify(updates));
  fb(['database:update', '/', JSON.stringify(p), '--project', project, '--force']);
};

// ---------------------------------------------------------------- undo
const undoFile = value('undo');
if (undoFile) {
  const m = JSON.parse(fs.readFileSync(undoFile, 'utf8'));
  const removals = { [`allquiz/${m.quizId}`]: null };
  m.questionIds.forEach((id) => {
    removals[`quizqq/${id}`] = null;
  });
  if (m.createdBank) removals[`main_category/${m.createdBank}`] = null;
  if (m.createdBook) removals[`mcqs/${m.createdBook}`] = null;
  console.log(`Removing "${m.title}" (${m.questionIds.length} questions) created on ${m.at}.`);
  if (!flag('commit')) {
    console.log('DRY RUN — add --commit to remove it.');
    process.exit(0);
  }
  write(removals, 'exam-undo.json');
  console.log('Removed.');
  process.exit(0);
}

// ---------------------------------------------------------------- read
const file = args.find((a) => !a.startsWith('--') && a.endsWith('.json') && fs.existsSync(a));
const bank = value('bank');
const book = value('book');
if (!file || !bank || !book) {
  console.error('Usage: node scripts/upload-exam-json.mjs <file.json> --bank <source> --bank-title <title> --book <source> --book-title <title> [--commit]');
  process.exit(1);
}
const bankTitle = value('bank-title') || bank;
const bookTitle = value('book-title') || book;
const img = value('img') || '';
const paper = JSON.parse(fs.readFileSync(file, 'utf8'));
const title = value('title') || paper.title;

const problems = [];
paper.questions.forEach((q, i) => {
  if (!String(q.question || '').trim()) problems.push(`#${i + 1}: no stem`);
  if (!OPTION_KEYS.includes(q.answer) || !String(q[q.answer] || '').trim()) problems.push(`#${i + 1}: answer "${q.answer}" has no option`);
});
if (problems.length) {
  console.error(`Not uploading:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

console.log('Reading main_category, mcqs and allquiz…');
const banks = read('main_category');
const books = read('mcqs');
const quizzes = read('allquiz');

const bankHit = Object.entries(banks).find(([, b]) => b.source === bank);
const bookHit = Object.entries(books).find(([, b]) => b.source === book);
if (bookHit && bookHit[1].main_category !== bank) {
  console.error(`Book "${book}" already exists under bank "${bookHit[1].main_category}", not "${bank}".`);
  process.exit(1);
}
const dupe = Object.entries(quizzes).find(
  ([, q]) => q.source === book && String(q.title || '').trim().toLowerCase() === title.trim().toLowerCase(),
);
if (dupe) {
  console.log(`"${title}" is already in ${book} (allquiz/${dupe[0]}) — nothing to do.`);
  process.exit(0);
}

// ---------------------------------------------------------------- build
const updates = {};
const manifest = { at: new Date().toISOString(), project, title, bank, book, questionIds: [] };

if (!bankHit) {
  manifest.createdBank = pushKey();
  updates[`main_category/${manifest.createdBank}`] = { title: bankTitle, source: bank, type: 'quiz', publish: 'true', img };
}
if (!bookHit) {
  manifest.createdBook = pushKey();
  updates[`mcqs/${manifest.createdBook}`] = {
    title: bookTitle,
    source: book,
    sub_category: '',
    img,
    main_category: bank,
    type: 'quiz',
  };
}

manifest.quizId = pushKey();
const quiz = {
  title,
  des: paper.des || '',
  img,
  key: pushKey(),
  uploader: value('uploader') || 'Dr. Qusay Mohamed',
  source: book,
  preview: flag('preview') ? 'true' : 'false',
  number: String(paper.questions.length),
  type: '',
  month: '',
  year: '',
};
updates[`allquiz/${manifest.quizId}`] = quiz;

const chapters = {};
for (const q of paper.questions) {
  const record = buildRecord({ record: { e: '', exp_img: '', category2: '', ...q } }, quiz);
  Object.assign(record, browseFields(record, bank));
  chapters[record.chapter] = (chapters[record.chapter] || 0) + 1;
  const id = pushKey();
  manifest.questionIds.push(id);
  updates[`quizqq/${id}`] = record;
}

console.log('');
console.log(`Bank  ${bankHit ? `exists  main_category/${bankHit[0]}` : `NEW     "${bankTitle}" (${bank})`}`);
console.log(`Book  ${bookHit ? `exists  mcqs/${bookHit[0]}` : `NEW     "${bookTitle}" (${book})`}`);
console.log(`Quiz  NEW     "${title}" — ${paper.questions.length} questions, ${quiz.preview === 'true' ? 'hidden (preview)' : 'published'}`);
Object.entries(chapters)
  .sort((a, b) => b[1] - a[1])
  .forEach(([ch, n]) => console.log(`        ${String(n).padStart(3)}  ${ch}`));

if (!flag('commit')) {
  fs.writeFileSync(path.join(outDir, 'exam-upload.json'), JSON.stringify(updates, null, 1));
  console.log('\nDRY RUN — nothing written. Payload left at .tmp/exam-upload.json; add --commit to write it.');
  process.exit(0);
}

console.log('\nWriting…');
write(updates, 'exam-upload.json');
const manifestPath = path.join(outDir, `exam-upload-keys-${book}.json`);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log(`Done. allquiz/${manifest.quizId}, key ${quiz.key}`);
console.log(`To take it back out: node scripts/upload-exam-json.mjs --undo ${manifestPath} --commit`);
