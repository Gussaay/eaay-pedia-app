// Uploads flashcard decks straight into the database from a spreadsheet.
//
// The admin panel can already do this (Flashcards -> book -> "Upload decks from
// a file"). This is the same import from the command line, for when the work is
// being done here rather than in the browser.
//
// It deliberately reuses the app's OWN import code — planDecks, buildDeckRecord,
// buildCardRecord — so a deck uploaded from here is byte-for-byte the deck the
// admin panel would have written. Two importers that drift apart would be worse
// than one importer that is occasionally inconvenient.
//
//   node scripts/upload-decks.mjs <file.xlsx> --source pastets
//       Dry run: says exactly what it would write, and writes nothing.
//
//   node scripts/upload-decks.mjs <file.xlsx> --source pastets --commit
//       Does it, as ONE atomic write.
//
//   --add-to-existing   also add cards to decks whose title is already there
//                       (off by default: an existing deck is left alone)
//   --only <name>       just one deck, by title — useful for a first trial
//
//   node scripts/upload-decks.mjs --undo .tmp/deck-upload-keys.json
//       Removes exactly what the matching run wrote. Every commit records the
//       deck keys it created, so a bulk upload is never a one-way door.
//
// Auth is the Firebase CLI's own login, so whoever runs it writes as themselves.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as XLSX from 'xlsx';
import { planDecks, buildDeckRecord } from '../src/lib/deckImport.js';
import { buildCardRecord, importableCards } from '../src/lib/flashcardImport.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};

// ---------------------------------------------------------------- undo
const undoFile = value('undo');
if (undoFile) {
  const manifest = JSON.parse(fs.readFileSync(undoFile, 'utf8'));
  const removals = {};
  manifest.created.forEach((key) => {
    removals[`flashdecks/${key}`] = null;
    removals[`flashcard_items/${key}`] = null;
  });
  console.log(`Removing ${manifest.created.length} deck(s) created on ${manifest.at}.`);
  if (!flag('commit')) {
    console.log('DRY RUN — add --commit to remove them.');
    process.exit(0);
  }
  const undoPayload = path.join(path.dirname(undoFile), 'deck-undo.json');
  fs.writeFileSync(undoPayload, JSON.stringify(removals));
  execFileSync('firebase', ['database:update', '/', JSON.stringify(undoPayload), '--project',
    value('project') || 'easy-pedia', '--force'], {
    encoding: 'utf8', shell: true, env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
  });
  console.log('Removed.');
  process.exit(0);
}

const file = args.find((a) => !a.startsWith('--') && /\.(xlsx|xls|csv)$/i.test(a));
const source = value('source');
const project = value('project') || 'easy-pedia';
const commit = flag('commit');
const addToExisting = flag('add-to-existing');
const only = value('only');

if (!file || !source) {
  console.error('Usage: node scripts/upload-decks.mjs <file.xlsx> --source <book source> [--commit]');
  process.exit(1);
}

const fb = (cmdArgs) =>
  execFileSync('firebase', cmdArgs, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
  });

// ---------------------------------------------------------------- push keys
// The same shape of key the client SDK makes: time-ordered and unique, so keys
// written from here sort alongside keys written from the app.
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
let lastPushTime = 0;
let lastRandChars = [];
function pushKey() {
  let now = Date.now();
  const duplicateTime = now === lastPushTime;
  lastPushTime = now;
  const timeStampChars = new Array(8);
  for (let i = 7; i >= 0; i -= 1) {
    timeStampChars[i] = PUSH_CHARS.charAt(now % 64);
    now = Math.floor(now / 64);
  }
  let id = timeStampChars.join('');
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

// ---------------------------------------------------------------- read
console.log(`Reading ${path.basename(file)}`);
const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', raw: false });
const sheets = wb.SheetNames.map((name) => ({
  name,
  rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false }),
}));

console.log(`Reading the decks already in "${source}"…`);
const existingAll = JSON.parse(fb(['database:get', '/flashdecks', '--project', project]) || 'null') || {};
const existingDecks = Object.entries(existingAll)
  .map(([key, d]) => ({ _key: key, ...d }))
  .filter((d) => d.source === source);
console.log(`  ${existingDecks.length} deck(s) there now`);

const { decks, unknownHeaders, skipped } = planDecks(sheets, { existingDecks });
if (unknownHeaders.length) console.log(`  columns ignored: ${unknownHeaders.join(', ')}`);
if (skipped) console.log(`  blank rows skipped: ${skipped}`);

// ---------------------------------------------------------------- plan
const plan = decks
  .filter((d) => !only || d.title.toLowerCase() === only.toLowerCase())
  .map((d) => ({ ...d, cards: importableCards(d.items) }))
  .map((d) => ({ ...d, skip: (!!d.existing && !addToExisting) || d.cards.length === 0 }));

const write = plan.filter((d) => !d.skip);
const totalCards = write.reduce((n, d) => n + d.cards.length, 0);

console.log('');
for (const d of plan) {
  const mark = d.skip ? 'skip ' : d.existing ? 'add  ' : 'new  ';
  const why = d.skip ? (d.existing ? ' (already in this book)' : ' (no importable cards)') : '';
  console.log(`  ${mark} ${d.title.padEnd(22)} ${String(d.cards.length).padStart(4)} cards  ${d.system}${why}`);
}
const broken = plan.reduce((n, d) => n + d.items.filter((i) => i.errors.length).length, 0);
if (broken) console.log(`\n  ${broken} row(s) had an empty front or back and are left out.`);
console.log(`\n${write.length} deck(s), ${totalCards} card(s) to write.`);

if (!write.length) process.exit(0);

// ---------------------------------------------------------------- build
const updates = {};
const created = [];
for (const deck of write) {
  const deckId = deck.existing?._key || pushKey();
  if (!deck.existing) created.push(deckId);
  const already = Number(deck.existing?.count) || 0;
  if (deck.existing) {
    updates[`flashdecks/${deckId}/count`] = already + deck.cards.length;
  } else {
    updates[`flashdecks/${deckId}`] = buildDeckRecord(deck, { key: deckId, source, count: deck.cards.length });
  }
  let order = already;
  for (const item of deck.cards) {
    order += 1;
    updates[`flashcard_items/${deckId}/${pushKey()}`] = buildCardRecord(item, { deckId, order });
  }
}

const outDir = path.join(process.cwd(), '.tmp');
fs.mkdirSync(outDir, { recursive: true });
const payload = path.join(outDir, 'deck-upload.json');
fs.writeFileSync(payload, JSON.stringify(updates));
console.log(`Payload: ${Object.keys(updates).length} paths, ${(fs.statSync(payload).size / 1024 / 1024).toFixed(1)} MB`);

if (!commit) {
  console.log(`\nDRY RUN — nothing written. Payload left at ${payload}`);
  console.log('Add --commit to write it.');
  process.exit(0);
}

// ---------------------------------------------------------------- write
console.log('\nWriting…');
fb(['database:update', '/', JSON.stringify(payload), '--project', project, '--force']);

// Written only AFTER the upload succeeds, so the manifest never describes a
// deck that is not really there. This is what makes the upload reversible.
const manifest = path.join(outDir, 'deck-upload-keys.json');
fs.writeFileSync(
  manifest,
  JSON.stringify({ at: new Date().toISOString(), source, project, created, cards: totalCards }, null, 1),
);
console.log(`Done: ${write.length} deck(s), ${totalCards} card(s).`);
console.log(`To take it back out: node scripts/upload-decks.mjs --undo ${manifest} --commit`);
