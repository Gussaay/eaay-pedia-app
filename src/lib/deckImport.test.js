import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldForHeader } from './flashcardImport.js';
import { headersOf, looksLikeMcqSheet, pickSheet, scoreSheet } from './sheetPick.js';
import { buildDeckRecord, deckFieldsOf, deckNameOf, planDecks, usableDecks } from './deckImport.js';

const CARD_FIELDS = { fieldFor: fieldForHeader, required: ['front', 'back'], disqualify: looksLikeMcqSheet };

// ---------------------------------------------------------------- sheetPick
test('headersOf reads the columns from the first row', () => {
  assert.deepEqual(headersOf([{ front: 'a', back: 'b' }]), ['front', 'back']);
  assert.deepEqual(headersOf([]), []);
});

test('a sheet missing a required field scores zero however many columns match', () => {
  const rows = [{ note: 'x', chapter: 'y', tags: 'z' }];
  assert.equal(scoreSheet(rows, CARD_FIELDS).score, 0);
});

test('the flashcard sheet is chosen out of a mixed workbook', () => {
  const sheets = [
    { name: 'Summary', rows: [{ section: 'Airway', note: 'Soot means intubate' }] },
    { name: 'Flashcards', rows: [{ front: 'Q', back: 'A', chapter: 'Airway' }] },
    { name: 'MCQs', rows: [{ question: 'Q', a: '1', b: '2', c: '3', d: '4', e: '5', answer: 'a' }] },
  ];
  const { best, usable } = pickSheet(sheets, CARD_FIELDS);
  assert.equal(best.name, 'Flashcards');
  assert.equal(usable.length, 1, 'the MCQ sheet must not count as importable cards');
});

test('an MCQ sheet is never imported as flashcards, even on its own', () => {
  const mcq = [{ question: 'Q', a: '1', b: '2', c: '3', d: '4', answer: 'a', exp: 'because' }];
  assert.ok(looksLikeMcqSheet(Object.keys(mcq[0])));
  assert.equal(pickSheet([{ name: 'MCQs', rows: mcq }], CARD_FIELDS).best, null);
});

test('a real flashcard sheet is not mistaken for MCQs', () => {
  assert.equal(looksLikeMcqSheet(['front', 'back', 'chapter', 'hint', 'note', 'tags']), false);
});

test('a single-sheet file still resolves to that sheet', () => {
  const sheets = [{ name: 'Sheet1', rows: [{ Term: 'Q', Definition: 'A' }] }];
  assert.equal(pickSheet(sheets, CARD_FIELDS).best.name, 'Sheet1');
});

test('a workbook with nothing importable returns no best sheet', () => {
  const sheets = [{ name: 'Notes', rows: [{ heading: 'x', body: 'y' }] }];
  assert.equal(pickSheet(sheets, CARD_FIELDS).best, null);
});

test('more rows breaks a tie between identical sheets', () => {
  const sheets = [
    { name: 'Empty template', rows: [{ front: '', back: '' }] },
    { name: 'Real', rows: [{ front: 'a', back: 'b' }, { front: 'c', back: 'd' }] },
  ];
  assert.equal(pickSheet(sheets, CARD_FIELDS).best.name, 'Real');
});

// ---------------------------------------------------------------- deckImport
test('deck-level columns are read, and a plain topic column is NOT the deck topic', () => {
  const fields = deckFieldsOf({
    deck_image: 'http://x/y.png',
    about: 'Two papers merged',
    order: '3',
    deck_topic: 'Cyanotic lesions',
    topic: 'Airway',
  });
  assert.equal(fields.img, 'http://x/y.png');
  assert.equal(fields.about, 'Two papers merged');
  assert.equal(fields.order, '3');
  assert.equal(fields.topic, 'Cyanotic lesions');
});

test('the deck name comes from the column, then the sheet name', () => {
  assert.equal(deckNameOf({ deckFromFile: 'From column' }, {}, 'Sheet1'), 'From column');
  assert.equal(deckNameOf({ deckFromFile: '' }, {}, 'Respiratory'), 'Respiratory');
});

test('one sheet per deck: each sheet becomes a deck named after its tab', () => {
  const { decks } = planDecks([
    { name: 'Anatomy', rows: [{ front: 'a', back: 'b', system: 'CNS' }] },
    { name: 'Ethics', rows: [{ front: 'c', back: 'd', system: 'Child Health' }] },
  ]);
  assert.deepEqual(decks.map((d) => d.title), ['Anatomy', 'Ethics']);
  assert.equal(decks[0].system, 'CNS');
  assert.equal(decks[0].items.length, 1);
});

test('one sheet, many decks: a deck column splits the rows', () => {
  const { decks } = planDecks([
    {
      name: 'Cards',
      rows: [
        { deck: 'Anatomy', system: 'CNS', deck_image: 'http://i/a.png', front: 'a', back: 'b' },
        { deck: 'Ethics', system: 'Child Health', front: 'c', back: 'd' },
        { deck: 'Anatomy', front: 'e', back: 'f' },
      ],
    },
  ]);
  assert.equal(decks.length, 2);
  const anatomy = decks.find((d) => d.title === 'Anatomy');
  assert.equal(anatomy.items.length, 2);
  assert.equal(anatomy.img, 'http://i/a.png');
  assert.equal(anatomy.system, 'CNS');
});

test('deck details need only appear on the first row of the deck', () => {
  const { decks } = planDecks([
    {
      name: 'Cards',
      rows: [
        { deck: 'A', system: 'CNS', about: 'Blurb', order: '2', front: 'a', back: 'b' },
        { deck: 'A', front: 'c', back: 'd' },
      ],
    },
  ]);
  assert.equal(decks[0].about, 'Blurb');
  assert.equal(decks[0].order, '2');
});

test('a deck already in the book is flagged rather than silently duplicated', () => {
  const { decks } = planDecks(
    [{ name: 'Cards', rows: [{ deck: 'Respiratory', front: 'a', back: 'b' }] }],
    { existingDecks: [{ _key: 'k1', title: 'respiratory  ' }] },
  );
  assert.ok(decks[0].existing);
  assert.equal(usableDecks(decks).length, 0);
  assert.equal(usableDecks(decks, { includeExisting: true }).length, 1);
});

test('duplicate fronts are judged INSIDE a deck, not across the workbook', () => {
  const { decks } = planDecks([
    {
      name: 'Cards',
      rows: [
        { deck: 'A', front: 'Same question', back: '1' },
        { deck: 'B', front: 'Same question', back: '2' },
        { deck: 'A', front: 'Same question', back: '3' },
      ],
    },
  ]);
  const a = decks.find((d) => d.title === 'A');
  const b = decks.find((d) => d.title === 'B');
  assert.equal(b.items[0].duplicate, null, 'the same front in another deck is not a duplicate');
  assert.ok(a.items[1].duplicate, 'the repeat within deck A is');
});

test('publish is off only for an explicit false', () => {
  const { decks } = planDecks([
    {
      name: 'Cards',
      rows: [
        { deck: 'Hidden', publish: 'false', front: 'a', back: 'b' },
        { deck: 'Shown', publish: 'yes', front: 'c', back: 'd' },
      ],
    },
  ]);
  assert.equal(decks.find((d) => d.title === 'Hidden').publish, false);
  assert.equal(decks.find((d) => d.title === 'Shown').publish, true);
});

test('buildDeckRecord writes what flashdecks expects', () => {
  const record = buildDeckRecord(
    { title: 'Anatomy', system: 'CNS', topic: '', about: '', img: '', order: '4', publish: true },
    { key: 'k9', source: 'pastets', count: 31 },
  );
  assert.equal(record.key, 'k9');
  assert.equal(record.source, 'pastets');
  assert.equal(record.order, 4);
  assert.equal(record.count, 31);
  assert.equal(record.publish, true);
  assert.match(record.created, /^\d{4}-\d{2}-\d{2}$/);
});

test('a blank order becomes 0 rather than NaN', () => {
  const record = buildDeckRecord({ title: 'A', order: '' }, { key: 'k', source: 's', count: 1 });
  assert.equal(record.order, 0);
});
