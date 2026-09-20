// Bulk import of a full question set from Excel/CSV.
// Pure logic (no React, no Firebase) so it can be unit-tested: npm test.

import { OPTION_KEYS } from './quiz.js';

/** Accepted column names -> field. Case/space/underscore insensitive. */
const HEADER_ALIASES = {
  question: 'question',
  questions: 'question',
  q: 'question',
  questiontext: 'question',
  stem: 'question',
  a: 'a',
  optiona: 'a',
  choicea: 'a',
  answera: 'a',
  b: 'b',
  optionb: 'b',
  choiceb: 'b',
  answerb: 'b',
  c: 'c',
  optionc: 'c',
  choicec: 'c',
  answerc: 'c',
  d: 'd',
  optiond: 'd',
  choiced: 'd',
  answerd: 'd',
  e: 'e',
  optione: 'e',
  choicee: 'e',
  answere: 'e',
  answer: 'answer',
  correct: 'answer',
  correctanswer: 'answer',
  key: 'answer',
  rightanswer: 'answer',
  exp: 'exp',
  explanation: 'exp',
  explain: 'exp',
  rationale: 'exp',
  expimg: 'exp_img',
  explanationimage: 'exp_img',
  explanationimageurl: 'exp_img',
  image: 'exp_img',
  imageurl: 'exp_img',
  category1: 'category1',
  category: 'category1',
  system: 'category1',
  chapter: 'category1',
  category2: 'category2',
  system2: 'category2',
  chapter2: 'category2',
  title: 'title',
  source: 'title', // some sheets label the exam name "source"
};

export const normalizeHeader = (h) =>
  String(h || '')
    .toLowerCase()
    .replace(/[\s_\-.()]/g, '')
    .trim();

export const fieldForHeader = (h) => HEADER_ALIASES[normalizeHeader(h)] || null;

const clean = (v) =>
  v === undefined || v === null ? '' : String(v).replace(/\r/g, '').replace(/ /g, ' ').trim();

const compare = (v) => clean(v).toLowerCase().replace(/\s+/g, ' ').replace(/[.;:,]+$/, '');

/**
 * Works out which option is correct. Accepts "a", "A", "A.", "option b",
 * 1..5, or the full text of the correct option.
 */
export function resolveAnswer(raw, options) {
  const v = compare(raw);
  if (!v) return '';
  const letter = v.replace(/^option\s*/, '').replace(/[).:-]$/, '').trim();
  if (OPTION_KEYS.includes(letter)) return letter;
  const byNumber = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e' }[letter];
  if (byNumber) return byNumber;
  // Full text of an option (some sheets repeat the answer text).
  const match = OPTION_KEYS.find((k) => options[k] && compare(options[k]) === v);
  if (match) return match;
  // "b) something" style
  const prefixed = /^([a-e])[).:-]\s+/.exec(v);
  if (prefixed) return prefixed[1];
  return '';
}

/** Strips a leading "A." / "b)" label from an option's own text. */
export const stripOptionLabel = (text, key) => {
  const re = new RegExp(`^${key}\\s*[).:-]\\s+`, 'i');
  return clean(text).replace(re, '');
};

/**
 * Converts rows from the sheet (array of objects keyed by the original header)
 * into importable questions.
 * Returns { items, skipped, unknownHeaders } where each item has
 * { row, record, errors[], duplicate, warning }.
 */
export function parseRows(rows, { existingQuestions = [] } = {}) {
  const existing = new Set(existingQuestions.map((q) => compare(q.question)).filter(Boolean));
  const seen = new Map();
  const unknownHeaders = new Set();
  const items = [];
  let skipped = 0;

  rows.forEach((raw, i) => {
    const values = {};
    Object.entries(raw).forEach(([header, value]) => {
      const field = fieldForHeader(header);
      if (!field) {
        if (clean(value) !== '') unknownHeaders.add(String(header));
        return;
      }
      if (values[field] === undefined || values[field] === '') values[field] = clean(value);
    });

    const hasAnything = ['question', ...OPTION_KEYS].some((f) => clean(values[f]) !== '');
    if (!hasAnything) {
      skipped += 1;
      return;
    }

    const options = {};
    OPTION_KEYS.forEach((k) => {
      options[k] = stripOptionLabel(values[k] || '', k);
    });
    const question = clean(values.question);
    const answer = resolveAnswer(values.answer, options);

    const errors = [];
    if (!question) errors.push('Question is empty');
    if (!options.a || !options.b) errors.push('Options A and B are required');
    if (!clean(values.answer)) errors.push('Correct answer is missing');
    else if (!answer) errors.push(`Correct answer "${clean(values.answer)}" is not one of the options`);
    else if (!options[answer]) errors.push(`Correct answer "${answer.toUpperCase()}" has no text`);

    const fingerprint = compare(question);
    let duplicate = null;
    if (fingerprint && existing.has(fingerprint)) duplicate = 'in this quiz already';
    else if (fingerprint && seen.has(fingerprint)) duplicate = `same as row ${seen.get(fingerprint)}`;
    if (fingerprint && !seen.has(fingerprint)) seen.set(fingerprint, i + 2); // +2: header row + 1-based

    items.push({
      row: i + 2,
      errors,
      duplicate,
      record: {
        question,
        a: options.a,
        b: options.b,
        c: options.c,
        d: options.d,
        e: options.e,
        answer,
        exp: clean(values.exp),
        exp_img: clean(values.exp_img),
        category1: clean(values.category1),
        category2: clean(values.category2),
      },
      titleFromFile: clean(values.title),
    });
  });

  return { items, skipped, unknownHeaders: [...unknownHeaders] };
}

/** Rows that will actually be written (valid, and not skipped as duplicates). */
export const importableItems = (items, { includeDuplicates = false } = {}) =>
  items.filter((it) => it.errors.length === 0 && (includeDuplicates || !it.duplicate));

/** Builds the quizqq record exactly like the admin "Add question" screen. */
export const buildRecord = (item, quiz) => ({
  key: quiz.key,
  source: quiz.source || '',
  type: quiz.type || '',
  title: quiz.title || '',
  ...item.record,
});

export const TEMPLATE_HEADERS = [
  'question',
  'a',
  'b',
  'c',
  'd',
  'e',
  'answer',
  'explanation',
  'category1',
  'category2',
  'explanation_image_url',
];

export const TEMPLATE_EXAMPLE = [
  'A 2-year-old presents with barking cough and inspiratory stridor. What is the most likely diagnosis?',
  'Croup',
  'Epiglottitis',
  'Foreign body aspiration',
  'Bronchiolitis',
  '',
  'a',
  'Barking cough with inspiratory stridor in a toddler is typical of viral croup.',
  'Respiratory',
  '',
  '',
];

/** CSV text for the downloadable template (BOM so Excel keeps Arabic/UTF-8). */
export function templateCsv() {
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return `﻿${TEMPLATE_HEADERS.join(',')}\n${TEMPLATE_EXAMPLE.map(escape).join(',')}\n`;
}
