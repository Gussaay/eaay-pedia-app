// Uploads a book of drawn mnemonics from one JSON file: a mnemonic category,
// a book, its decks and their cards, in one database write.
//
//   node scripts/upload-mnemonic-book.mjs <book.json>            dry run
//   node scripts/upload-mnemonic-book.mjs <book.json> --commit
//
// book.json:
//   {
//     "category": { "title", "source", "icon" },   icon = a name in subject-icons.mjs
//     "book":     { "title", "source", "icon" },
//     "decks": [ { "title", "icon", "cards": [ { "front", "visual", "chapter", "source" } ] } ]
//   }
//
// Each deck is a clinical chapter. A card's `chapter` is its basic-science
// section (Pharmacology, Physiology… or Clinical) and `source` is where it
// comes from; the app browses a paper by chapter, by section and by source.
//
// `visual` is the drawn back (see src/components/MnemonicVisual.jsx). If the
// category already exists (same source) it is reused, so a second book can be
// added under an existing subject; a book whose source exists is refused.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { subjectIcon } from './subject-icons.mjs';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const [FILE] = args.filter((a) => !a.startsWith('--'));
const project = 'easy-pedia';
if (!FILE) {
  console.error('Usage: node scripts/upload-mnemonic-book.mjs <book.json> [--commit]');
  process.exit(1);
}

const fb = (a) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return execFileSync('firebase', [...a, '--project', project], {
        encoding: 'utf8',
        maxBuffer: 128 * 1024 * 1024,
        env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
        shell: true,
      });
    } catch (e) {
      // The CLI now and then fails to look up the database instance; a retry clears it.
      if (attempt >= 4) throw e;
    }
  }
};

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

// ---------------------------------------------------------------- plan
const spec = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const { category, book, decks } = spec;
const bad = decks.flatMap((d) => d.cards.filter((c) => !c.front || !c.visual).map(() => d.title));
if (bad.length) throw new Error(`Cards without a front or drawn back in: ${[...new Set(bad)].join(', ')}`);
let total = 0;
for (const d of decks) {
  total += d.cards.length;
  console.log(`  ${d.title.padEnd(32)} ${String(d.cards.length).padStart(3)} cards`);
}
console.log(`\n"${book.title}" under "${category.title}": ${decks.length} decks, ${total} cards.`);

const existingCats = JSON.parse(fb(['database:get', '/flashcategory']) || 'null') || {};
const existingBooks = JSON.parse(fb(['database:get', '/flashbooks']) || 'null') || {};
const catEntry = Object.entries(existingCats).find(([, c]) => c.source === category.source);
if (Object.values(existingBooks).some((b) => b.source === book.source)) {
  console.log(`A book with source "${book.source}" already exists. Stopping.`);
  process.exit(1);
}
console.log(catEntry ? `Category exists — adding the book under it.` : `New category will be created.`);

if (!commit) {
  console.log('\nDRY RUN — nothing written. Add --commit.');
  process.exit(0);
}

// ---------------------------------------------------------------- write
const today = new Date().toISOString().slice(0, 10);
const updates = {};
let categoryKey = catEntry?.[0];
if (!categoryKey) {
  categoryKey = pushKey();
  updates[`flashcategory/${categoryKey}`] = {
    title: category.title,
    source: category.source,
    img: subjectIcon(category.icon) || '',
    publish: true,
    kind: 'mnemonic',
  };
}
const bookKey = pushKey();
updates[`flashbooks/${bookKey}`] = {
  title: book.title,
  source: book.source,
  main_category: category.source,
  img: subjectIcon(book.icon) || '',
  publish: true,
};
const created = [];
decks.forEach((d, i) => {
  const deckId = pushKey();
  created.push(deckId);
  updates[`flashdecks/${deckId}`] = {
    key: deckId,
    source: book.source,
    title: d.title,
    system: d.system || 'By system',
    topic: '',
    img: subjectIcon(d.icon) || '',
    about: d.about || spec.about || '',
    order: i + 1,
    publish: true,
    count: d.cards.length,
    created: today,
    kind: 'mnemonic',
  };
  d.cards.forEach((c, n) => {
    updates[`flashcard_items/${deckId}/${pushKey()}`] = {
      deck: deckId,
      order: n + 1,
      front: c.front,
      back: '',
      back_img: '',
      visual: c.visual,
      img: '',
      hint: '',
      note: '',
      tags: '',
      // The basic-science section (Pharmacology, Physiology… or Clinical) and
      // where the card comes from: both are ways of browsing a paper.
      chapter: c.chapter || '',
      source: c.source || '',
    };
  });
});

const outDir = path.join(process.cwd(), '.tmp');
fs.mkdirSync(outDir, { recursive: true });
const payload = path.join(outDir, `mnemonic-book-${book.source}.json`);
fs.writeFileSync(payload, JSON.stringify(updates));
fb(['database:update', '/', JSON.stringify(payload), '--force']);
fs.writeFileSync(
  path.join(outDir, `mnemonic-book-${book.source}-keys.json`),
  JSON.stringify({ at: new Date().toISOString(), category: catEntry ? null : categoryKey, book: bookKey, decks: created }, null, 1),
);
console.log(`Done: ${decks.length} decks, ${total} cards.`);
