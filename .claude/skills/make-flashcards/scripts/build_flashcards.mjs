#!/usr/bin/env node
// Builds a flashcard upload file for the Easy Pedia MCQs app.
//
//   node build_flashcards.mjs --in cards1.json cards2.json \
//        --out "C:/Users/Lenovo/Downloads/deck-name" --split
//
// Input is JSON rather than CSV because quoting a 300-card CSV by hand is
// where mistakes come from: one unescaped comma shifts every later column and
// the import silently writes rubbish. JSON round-trips exactly.
//
// Validation runs through the app's own parser (src/lib/flashcardImport.js)
// whenever the script can find it, because that is the exact code the import
// screen will run. Anything else is a guess at what it does.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HEADERS = ['front', 'back', 'hint', 'note', 'chapter', 'tags', 'image_url'];

// Short keys are for writing by hand; long keys match the sheet columns.
const FIELD_ALIASES = {
  f: 'front', q: 'front', front: 'front', question: 'front',
  b: 'back', a: 'back', back: 'back', answer: 'back',
  h: 'hint', hint: 'hint',
  n: 'note', note: 'note', exp: 'note', explanation: 'note',
  ch: 'chapter', chapter: 'chapter', section: 'chapter', topic: 'chapter',
  t: 'tags', tags: 'tags',
  img: 'image_url', image: 'image_url', imageurl: 'image_url',
};

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const listOf = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return [];
  const out = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j += 1) out.push(argv[j]);
  return out;
};
const valueOf = (name, fallback = null) => listOf(name)[0] ?? fallback;
const flag = (name) => argv.includes(`--${name}`);

const inputs = listOf('in');
const outPrefix = valueOf('out');
if (!inputs.length || !outPrefix) {
  console.error('Usage: --in <file.json...> --out <path/prefix> [--split] [--quiet]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load and normalise
// ---------------------------------------------------------------------------
const cards = [];
for (const file of inputs) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`Could not read ${file}: ${e.message}`);
    process.exit(1);
  }
  const rows = Array.isArray(parsed) ? parsed : parsed.cards;
  if (!Array.isArray(rows)) {
    console.error(`${file} should be a JSON array of cards, or an object with a "cards" array.`);
    process.exit(1);
  }
  rows.forEach((raw) => {
    const card = {};
    for (const [key, value] of Object.entries(raw)) {
      const field = FIELD_ALIASES[String(key).toLowerCase().replace(/[\s_-]/g, '')];
      if (field && (card[field] === undefined || card[field] === '')) {
        card[field] = value === null || value === undefined ? '' : String(value).trim();
      }
    }
    card.__source = basename(file);
    cards.push(card);
  });
}

if (!cards.length) {
  console.error('No cards found in the input files.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Checks. Errors block the build; warnings are printed and the build goes on,
// because "the back is a bit long" is a judgement call and "the front is
// empty" is not.
// ---------------------------------------------------------------------------
const errors = [];
const warnings = [];

// Matches the app's own duplicate test, so this report agrees with the preview.
const fingerprint = (v) =>
  String(v || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.;:,]+$/, '').trim();

const seen = new Map();
const chapterCase = new Map();

cards.forEach((card, i) => {
  const at = `card ${i + 1} (${card.__source})`;
  const front = card.front || '';
  const back = card.back || '';

  if (!front) errors.push(`${at}: the front is empty`);
  if (!back && !card.image_url) errors.push(`${at}: the back is empty`);

  const fp = fingerprint(front);
  if (fp) {
    if (seen.has(fp)) errors.push(`${at}: same front as card ${seen.get(fp)}`);
    else seen.set(fp, i + 1);
  }

  // Two spellings of one chapter become two entries in the study picker, which
  // splits the deck in a way nobody intended.
  const ch = card.chapter || '';
  if (ch) {
    const key = ch.toLowerCase().trim();
    const known = chapterCase.get(key);
    if (known && known !== ch) {
      errors.push(`${at}: chapter "${ch}" also appears as "${known}" - pick one spelling`);
    } else if (!known) {
      chapterCase.set(key, ch);
    }
  } else {
    warnings.push(`${at}: no chapter, so it lands under "Unsorted"`);
  }

  // A long back is usually several cards wearing a trenchcoat: the learner
  // misses one clause, the whole card is graded wrong, and the parts they knew
  // get scheduled again anyway.
  if (back.length > 200) {
    warnings.push(`${at}: the back is ${back.length} characters - consider splitting it`);
  }
  // "Does surfactant raise or lower surface tension?" opens the same way but
  // asks the learner to choose, so it is not a coin flip.
  if (/^(is|are|does|do|can|will|should|has|have)\b/i.test(front) && !/\bor\b/i.test(front)) {
    warnings.push(`${at}: the front reads as a yes/no question, which can be guessed half the time`);
  }
});

// ---------------------------------------------------------------------------
// Second opinion from the app's real parser
// ---------------------------------------------------------------------------
// The skill may be installed per-project or in ~/.claude/skills, so the app is
// found by walking up from wherever the command was run and from the script
// itself, rather than by a fixed relative path.
function findAppParser() {
  for (const start of [process.cwd(), HERE]) {
    let dir = resolve(start);
    for (let up = 0; up < 8; up += 1) {
      const candidate = resolve(dir, 'src/lib/flashcardImport.js');
      if (existsSync(candidate)) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

let parserNote = 'app parser not found, so only this script checked the cards';
try {
  const parserPath = findAppParser();
  if (!parserPath) throw new Error('not found');
  const { parseCardRows, importableCards } = await import(pathToFileURL(parserPath).href);
  const rows = cards.map((c) => ({
    front: c.front || '',
    back: c.back || '',
    hint: c.hint || '',
    note: c.note || '',
    chapter: c.chapter || '',
    tags: c.tags || '',
    image_url: c.image_url || '',
  }));
  const { items, unknownHeaders } = parseCardRows(rows);
  items.filter((it) => it.errors.length).forEach((it) => {
    errors.push(`row ${it.row} (app parser): ${it.errors.join('; ')}`);
  });
  items.filter((it) => it.duplicate).forEach((it) => {
    errors.push(`row ${it.row} (app parser): duplicate - ${it.duplicate}`);
  });
  if (unknownHeaders.length) warnings.push(`app parser ignored columns: ${unknownHeaders.join(', ')}`);
  parserNote = `app parser accepted ${importableCards(items).length} of ${rows.length} cards`;
} catch {
  // Running outside the repo is normal; the built-in checks still apply.
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s) to fix before this can be uploaded:\n`);
  errors.slice(0, 40).forEach((e) => console.error(`  - ${e}`));
  if (errors.length > 40) console.error(`  ... and ${errors.length - 40} more`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
// The BOM is what makes Excel read the file as UTF-8 instead of mangling
// anything that is not plain ASCII.
const toCsv = (rows) =>
  `\uFEFF${HEADERS.join(',')}\n${rows
    .map((c) => HEADERS.map((h) => escape(c[h] || '')).join(','))
    .join('\n')}\n`;

const write = (path, text) => {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, text, 'utf8');
  return path;
};

const written = [write(`${outPrefix}.csv`, toCsv(cards))];

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'unsorted';

// Chapters keep their first-appearance order: a deck that follows a book should
// come out in the book's order, not alphabetically.
const chapters = [];
cards.forEach((c) => {
  const name = c.chapter || 'Unsorted';
  let entry = chapters.find((x) => x.name === name);
  if (!entry) chapters.push((entry = { name, cards: [] }));
  entry.cards.push(c);
});

if (flag('split')) {
  chapters.forEach((ch, i) => {
    const n = String(i + 1).padStart(2, '0');
    written.push(write(`${outPrefix}-${n}-${slug(ch.name)}.csv`, toCsv(ch.cards)));
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (!flag('quiet')) {
  console.log(`\n${cards.length} cards across ${chapters.length} chapter(s).`);
  console.log(`Check: ${parserNote}.\n`);
  const width = Math.max(...chapters.map((c) => c.name.length));
  chapters.forEach((c) => console.log(`  ${c.name.padEnd(width)}  ${String(c.cards.length).padStart(4)}`));

  if (warnings.length) {
    console.log(`\n${warnings.length} thing(s) worth a look (not blocking):`);
    warnings.slice(0, 15).forEach((w) => console.log(`  - ${w}`));
    if (warnings.length > 15) console.log(`  ... and ${warnings.length - 15} more`);
  }
  console.log('\nWrote:');
  written.forEach((p) => console.log(`  ${p}`));
}
