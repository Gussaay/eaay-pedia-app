import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMPLATE_HEADERS,
  buildCardRecord,
  fieldForHeader,
  importableCards,
  parseCardRows,
  parseTags,
  templateCsv,
} from './flashcardImport.js';

test('column names are matched whatever the sheet calls them', () => {
  ['front', 'Front', 'FRONT', 'Question', ' term ', 'Side 1', 'side_1'].forEach((h) =>
    assert.equal(fieldForHeader(h), 'front', `${h} should map to front`),
  );
  ['back', 'Answer', 'Definition', 'Side 2'].forEach((h) =>
    assert.equal(fieldForHeader(h), 'back', `${h} should map to back`),
  );
  assert.equal(fieldForHeader('Image URL'), 'img');
  assert.equal(fieldForHeader('nonsense'), null);
});

test('tags are tidied whichever separator was used', () => {
  assert.equal(parseTags('cardiology, murmurs ,  innocent'), 'cardiology, murmurs, innocent');
  assert.equal(parseTags('a;b|c'), 'a, b, c');
  assert.equal(parseTags(''), '');
});

test('a plain two-column sheet imports', () => {
  const { items, skipped } = parseCardRows([
    { Front: 'Commonest cause of croup', Back: 'Parainfluenza virus' },
    { Front: 'Normal neonatal heart rate', Back: '120-160 / min' },
  ]);
  assert.equal(items.length, 2);
  assert.equal(skipped, 0);
  assert.deepEqual(
    items.map((i) => i.errors),
    [[], []],
  );
  assert.equal(items[0].record.front, 'Commonest cause of croup');
  assert.equal(items[1].record.back, '120-160 / min');
});

test('blank rows are skipped rather than reported as broken', () => {
  const { items, skipped } = parseCardRows([
    { front: 'a', back: 'b' },
    { front: '', back: '' },
    { front: '   ', back: '' },
  ]);
  assert.equal(items.length, 1);
  assert.equal(skipped, 2);
});

test('a half-filled card is reported, not silently written', () => {
  const { items } = parseCardRows([
    { front: 'Only a front', back: '' },
    { front: '', back: 'Only a back' },
  ]);
  assert.deepEqual(items[0].errors, ['The back of the card is empty']);
  assert.deepEqual(items[1].errors, ['The front of the card is empty']);
  assert.equal(importableCards(items).length, 0);
});

test('a card whose back is only an image is accepted', () => {
  const { items } = parseCardRows([
    { front: 'Name this rash', back: '', 'back image': 'https://example.com/rash.png' },
  ]);
  assert.deepEqual(items[0].errors, []);
  assert.equal(items[0].record.back_img, 'https://example.com/rash.png');
});

test('duplicates are flagged against the deck and within the file', () => {
  const { items } = parseCardRows(
    [
      { front: 'Cause of croup', back: 'Parainfluenza' },
      { front: 'cause of croup.', back: 'Parainfluenza virus' },
      { front: 'Already here', back: 'x' },
    ],
    { existingCards: [{ front: 'Already here' }] },
  );
  assert.equal(items[0].duplicate, null);
  assert.equal(items[1].duplicate, 'same as row 2', 'case and trailing stop should not hide a repeat');
  assert.equal(items[2].duplicate, 'in this deck already');

  assert.equal(importableCards(items).length, 1);
  assert.equal(importableCards(items, { includeDuplicates: true }).length, 3);
});

test('unrecognised columns are reported, but only when they hold something', () => {
  const { unknownHeaders } = parseCardRows([
    { front: 'a', back: 'b', Difficulty: 'hard', Reviewer: '' },
  ]);
  assert.deepEqual(unknownHeaders, ['Difficulty']);
});

test('the first matching column wins when a sheet has two names for one side', () => {
  const { items } = parseCardRows([{ question: 'from question', front: 'from front', back: 'b' }]);
  assert.equal(items[0].record.front, 'from question');
});

test('the record keeps the sheet order so a chapter deck stays in sequence', () => {
  const { items } = parseCardRows([{ front: 'a', back: 'b', chapter: 'Airway' }]);
  const record = buildCardRecord(items[0], { deckId: '-Nabc', order: 7 });
  assert.equal(record.deck, '-Nabc');
  assert.equal(record.order, 7);
  assert.equal(record.chapter, 'Airway');
});

test('every name a sheet gives the chapter column lands in one field', () => {
  // A sheet calling it "Section" must not create a second set of chapters
  // alongside one calling it "Topic" — the study picker lists them together.
  ['chapter', 'Chapter', 'Sub-category', 'Section', 'Topic', 'sub chapter', 'Part'].forEach((h) =>
    assert.equal(fieldForHeader(h), 'chapter', `${h} should map to chapter`),
  );
  const { items } = parseCardRows([
    { front: 'a', back: 'b', Section: 'Airway' },
    { front: 'c', back: 'd', Topic: 'Airway' },
  ]);
  assert.equal(items[0].record.chapter, 'Airway');
  assert.equal(items[1].record.chapter, 'Airway');
});

test('a specialty column is read as deck-level, not as the chapter', () => {
  const { items, unknownHeaders } = parseCardRows([
    { front: 'a', back: 'b', Specialty: 'Respiratory', Chapter: 'Upper airway' },
  ]);
  assert.equal(items[0].record.chapter, 'Upper airway');
  assert.equal(items[0].systemFromFile, 'Respiratory');
  assert.deepEqual(unknownHeaders, [], 'a specialty column should not be reported as unknown');
});

test('the template parses back into exactly one valid card', () => {
  const csv = templateCsv();
  assert.ok(csv.startsWith('﻿'), 'needs a BOM so Excel reads it as UTF-8');

  const [headerLine, exampleLine] = csv.replace(/^﻿/, '').trim().split('\n');
  assert.deepEqual(headerLine.split(','), TEMPLATE_HEADERS);

  const cells = exampleLine.match(/"([^"]|"")*"/g).map((c) => c.slice(1, -1).replace(/""/g, '"'));
  const row = Object.fromEntries(TEMPLATE_HEADERS.map((h, i) => [h, cells[i]]));
  const { items } = parseCardRows([row]);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].errors, []);
  assert.equal(items[0].record.tags, 'bronchiolitis, RSV, viral');
  assert.equal(items[0].record.chapter, 'Lower respiratory tract infection');
});
