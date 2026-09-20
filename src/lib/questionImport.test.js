import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fieldForHeader, resolveAnswer, stripOptionLabel, parseRows, importableItems,
  buildRecord, templateCsv, TEMPLATE_HEADERS,
} from './questionImport.js';

test('headers are matched regardless of case, spaces and underscores', () => {
  assert.equal(fieldForHeader('Question'), 'question');
  assert.equal(fieldForHeader('Option A'), 'a');
  assert.equal(fieldForHeader('correct_answer'), 'answer');
  assert.equal(fieldForHeader('Explanation Image URL'), 'exp_img');
  assert.equal(fieldForHeader('nonsense'), null);
});

test('correct answer is understood in several styles', () => {
  const opts = { a: 'Croup', b: 'Asthma', c: '', d: '', e: '' };
  assert.equal(resolveAnswer('a', opts), 'a');
  assert.equal(resolveAnswer('B', opts), 'b');
  assert.equal(resolveAnswer('A.', opts), 'a');
  assert.equal(resolveAnswer('Option B', opts), 'b');
  assert.equal(resolveAnswer(2, opts), 'b');
  assert.equal(resolveAnswer('Croup', opts), 'a'); // full text of the option
  assert.equal(resolveAnswer('z', opts), '');
  assert.equal(resolveAnswer('', opts), '');
});

test('option labels typed inside the cell are removed', () => {
  assert.equal(stripOptionLabel('a) Croup', 'a'), 'Croup');
  assert.equal(stripOptionLabel('B. Asthma', 'b'), 'Asthma');
  assert.equal(stripOptionLabel('Croup', 'a'), 'Croup');
});

const ROW = {
  Question: 'What is the most common cause of croup?',
  A: 'Parainfluenza virus',
  B: 'RSV',
  C: 'Adenovirus',
  D: 'Influenza',
  Answer: 'A',
  Explanation: 'Parainfluenza is the usual cause.',
  Category1: 'Respiratory',
};

test('a good row imports cleanly', () => {
  const { items, skipped } = parseRows([ROW]);
  assert.equal(skipped, 0);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].errors, []);
  assert.equal(items[0].record.answer, 'a');
  assert.equal(items[0].record.category1, 'Respiratory');
  assert.equal(items[0].row, 2);
});

test('blank rows are skipped and unknown columns reported', () => {
  const { items, skipped, unknownHeaders } = parseRows([
    ROW,
    { Question: '', A: '', B: '' },
    { ...ROW, Question: 'Another?', Notes: 'ignore me' },
  ]);
  assert.equal(skipped, 1);
  assert.equal(items.length, 2);
  assert.deepEqual(unknownHeaders, ['Notes']);
});

test('bad rows are flagged instead of imported', () => {
  const { items } = parseRows([
    { Question: 'No options?', Answer: 'a' },
    { Question: 'Bad answer', A: 'x', B: 'y', Answer: 'q' },
    { Question: 'Missing answer', A: 'x', B: 'y' },
    { Question: 'Answer without text', A: 'x', B: 'y', Answer: 'c' },
  ]);
  assert.match(items[0].errors[0], /Options A and B/);
  assert.match(items[1].errors[0], /not one of the options/);
  assert.match(items[2].errors[0], /missing/);
  assert.match(items[3].errors[0], /no text/);
  assert.equal(importableItems(items).length, 0);
});

test('duplicates inside the file and against the quiz are detected', () => {
  const { items } = parseRows([ROW, { ...ROW }, { ...ROW, Question: 'Unique question?' }], {
    existingQuestions: [{ question: 'what is the most common cause of croup?  ' }],
  });
  assert.equal(items[0].duplicate, 'in this quiz already');
  assert.equal(items[1].duplicate, 'in this quiz already');
  assert.equal(items[2].duplicate, null);
  assert.equal(importableItems(items).length, 1);
  assert.equal(importableItems(items, { includeDuplicates: true }).length, 3);
});

test('records are built in the database format', () => {
  const { items } = parseRows([ROW]);
  const rec = buildRecord(items[0], { key: 'PK1', source: 'nelson21', type: 'part1', title: 'Resp MCQs' });
  assert.equal(rec.key, 'PK1');
  assert.equal(rec.source, 'nelson21');
  assert.equal(rec.title, 'Resp MCQs');
  assert.equal(rec.a, 'Parainfluenza virus');
  assert.equal(rec.e, '');
  assert.equal(rec.exp_img, '');
});

test('template csv has a BOM, a header row and an example', () => {
  const csv = templateCsv();
  // The BOM makes Excel read the file as UTF-8 (note: trim() would strip it).
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.replace(/\n$/, '').split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].replace('﻿', '').split(',').length, TEMPLATE_HEADERS.length);
  assert.ok(lines[1].includes('Croup'));
});
