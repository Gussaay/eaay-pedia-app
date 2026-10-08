// Creates the "Philippa Basic Science" book inside MRCPCH.
//
// Two records, written as one atomic update: a `flashbooks` entry that the
// flashcard decks hang off, and an `mcqs` entry that the quizzes hang off.
// Both carry source "philippa", which is what the uploaders match on.
//
//   node scripts/create-philippa-book.mjs            dry run
//   node scripts/create-philippa-book.mjs --commit   writes it
//
// It refuses to run twice: if a book with this source already exists it prints
// the existing keys and stops, so a repeated run cannot create a duplicate.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { subjectIcon } from './subject-icons.mjs';

const args = process.argv.slice(2);
const project = 'easy-pedia';
const SOURCE = 'philippa';
const TITLE = 'Philippa Basic Science';

const fb = (a) =>
  execFileSync('firebase', a, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
  });

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

const books = JSON.parse(fb(['database:get', '/flashbooks', '--project', project]) || 'null') || {};
const quizBooks = JSON.parse(fb(['database:get', '/mcqs', '--project', project]) || 'null') || {};

const existingBook = Object.entries(books).find(([, b]) => b.source === SOURCE);
const existingQuizBook = Object.entries(quizBooks).find(([, b]) => b.source === SOURCE);

if (existingBook || existingQuizBook) {
  console.log('Already there — nothing to do.');
  if (existingBook) console.log(`  flashbooks/${existingBook[0]}  ${existingBook[1].title}`);
  if (existingQuizBook) console.log(`  mcqs/${existingQuizBook[0]}  ${existingQuizBook[1].title}`);
  process.exit(0);
}

const img = subjectIcon('Molecular') || '';
const bookKey = pushKey();
const quizBookKey = pushKey();

const updates = {
  [`flashbooks/${bookKey}`]: {
    img,
    main_category: 'mrcpch',
    publish: true,
    source: SOURCE,
    title: TITLE,
  },
  [`mcqs/${quizBookKey}`]: {
    img,
    main_category: 'mrcpch',
    source: SOURCE,
    sub_category: '',
    title: TITLE,
    type: 'quiz',
  },
};

console.log(`Creating "${TITLE}" under MRCPCH, source "${SOURCE}":`);
console.log(`  flashbooks/${bookKey}`);
console.log(`  mcqs/${quizBookKey}`);

const outDir = path.join(process.cwd(), '.tmp');
fs.mkdirSync(outDir, { recursive: true });
const payload = path.join(outDir, 'philippa-book.json');
fs.writeFileSync(payload, JSON.stringify(updates));

if (!args.includes('--commit')) {
  console.log('\nDRY RUN — nothing written. Add --commit to write it.');
  process.exit(0);
}

fb(['database:update', '/', JSON.stringify(payload), '--project', project, '--force']);
fs.writeFileSync(
  path.join(outDir, 'philippa-book-keys.json'),
  JSON.stringify({ at: new Date().toISOString(), source: SOURCE, flashbook: bookKey, mcqs: quizBookKey }, null, 1),
);
console.log('\nDone. Keys recorded in .tmp/philippa-book-keys.json');
