// Uploads the TAS pharmacology mnemonics: category, book, one deck per drug
// class, and the cards, in one database write.
//
// A mnemonic is a flashcard whose back is drawn by the app from a small
// description (see src/components/MnemonicVisual.jsx), so nothing is uploaded
// to Storage — the whole set is under 100 KB. `kind: 'mnemonic'` on the
// category puts it under Mnemonics instead of Flash Cards.
//
//   node scripts/upload-mnemonics.mjs <visuals.json>             dry run
//   node scripts/upload-mnemonics.mjs <visuals.json> --commit
//
// visuals.json lists every card as { cls, n, front, visual }: its drug class
// (one deck per class), its position in that deck, the question on the front
// and the description of its drawn back.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { subjectIcon } from './subject-icons.mjs';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const [INDEX] = args.filter((a) => !a.startsWith('--'));
const project = 'easy-pedia';

const CATEGORY = { title: 'Pharmacology', source: 'mnem-pharmacology' };
const BOOK = { title: 'TAS Pharmacology Mnemonics', source: 'mnem-tas-pharmacology' };

// Drug class -> deck order and the subject icon it borrows.
const CLASSES = [
  ['Antiepileptics & CNS', 'Neurology'],
  ['Antimicrobials', 'Microbiology'],
  ['Cardiovascular', 'Cardiology'],
  ['Emergency & toxicology', 'Emergencies'],
  ['Haematology & anticoagulation', 'Haematology'],
  ['Immunology & oncology', 'Oncology'],
  ['GI, antiemetics & liver', 'Gastro'],
  ['Respiratory', 'Respiratory'],
  ['Renal & fluids', 'Nephrology'],
  ['Endocrine', 'Endocrine'],
  ['Analgesia & anaesthesia', 'Pain Palliative'],
  ['Principles & interactions', 'Pharmacology'],
];

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

// ---------------------------------------------------------------- plan
const cards = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const unknown = cards.filter((c) => !CLASSES.some(([cls]) => cls === c.cls));
if (unknown.length) throw new Error(`Unknown class: ${unknown[0].cls}`);
const undrawn = cards.filter((c) => !c.visual);
if (undrawn.length) throw new Error(`${undrawn.length} card(s) have no drawn back`);

const decks = CLASSES.map(([cls, icon]) => ({
  title: cls,
  icon,
  cards: cards.filter((c) => c.cls === cls).sort((a, b) => a.n - b.n),
}));
for (const d of decks) console.log(`  ${d.title.padEnd(32)} ${String(d.cards.length).padStart(3)} cards`);
console.log(`\n${decks.length} decks, ${cards.length} cards.`);

if (!commit) {
  console.log('\nDRY RUN — nothing written. Add --commit.');
  process.exit(0);
}

const existingCats = JSON.parse(fb(['database:get', '/flashcategory']) || 'null') || {};
if (Object.values(existingCats).some((c) => c.source === CATEGORY.source)) {
  console.log('Already uploaded — a category with this source exists. Stopping.');
  process.exit(1);
}

// ---------------------------------------------------------------- database
const today = new Date().toISOString().slice(0, 10);
const updates = {};
const categoryKey = pushKey();
const bookKey = pushKey();
updates[`flashcategory/${categoryKey}`] = { ...CATEGORY, img: subjectIcon('Pharmacology') || '', publish: true, kind: 'mnemonic' };
updates[`flashbooks/${bookKey}`] = {
  ...BOOK,
  main_category: CATEGORY.source,
  img: subjectIcon('Pharmacology') || '',
  publish: true,
};
const created = [];
decks.forEach((d, i) => {
  const deckId = pushKey();
  created.push(deckId);
  updates[`flashdecks/${deckId}`] = {
    key: deckId,
    source: BOOK.source,
    title: d.title,
    system: 'By drug class',
    topic: '',
    img: subjectIcon(d.icon) || '',
    about: `Memory hooks for ${d.title.toLowerCase()} questions from the TAS pharmacology question bank and the TAS 2025 paper.`,
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
      chapter: '',
    };
  });
});

const outDir = path.join(process.cwd(), '.tmp');
fs.mkdirSync(outDir, { recursive: true });
const payload = path.join(outDir, 'mnemonics-upload.json');
fs.writeFileSync(payload, JSON.stringify(updates));
fb(['database:update', '/', JSON.stringify(payload), '--force']);
fs.writeFileSync(
  path.join(outDir, 'mnemonics-upload-keys.json'),
  JSON.stringify({ at: new Date().toISOString(), category: categoryKey, book: bookKey, decks: created }, null, 1),
);
console.log(`Done: ${decks.length} decks, ${cards.length} cards. Keys in .tmp/mnemonics-upload-keys.json`);
