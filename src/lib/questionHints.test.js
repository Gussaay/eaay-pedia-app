import test from 'node:test';
import assert from 'node:assert/strict';
import { hintsOf, markHints, similarOf } from './questionHints.js';

test('similar questions read from a map or a list, without junk', () => {
  assert.deepEqual(similarOf({ similar: { q1: true, q2: true, q3: false } }), ['q1', 'q2']);
  assert.deepEqual(similarOf({ similar: ['q1', 'q1', 'a/b', ''] }), ['q1']);
  assert.deepEqual(similarOf({}), []);
  assert.deepEqual(similarOf(null), []);
});

test('hints read from a string, a list or a map', () => {
  assert.deepEqual(hintsOf({ hint: 'stridor | barking cough|x' }), ['stridor', 'barking cough']);
  assert.deepEqual(hintsOf({ hint: ['a b', 'a b'] }), ['a b']);
  assert.deepEqual(hintsOf({ hint: { 0: 'rash' } }), ['rash']);
  assert.deepEqual(hintsOf({}), []);
});

test('markHints marks whole-word matches and keeps the text intact', () => {
  const text = 'A 2-year-old with Barking  cough and stridor; no stridorous noise.';
  const parts = markHints(text, ['stridor', 'barking cough']);
  assert.equal(parts.map((p) => p.text).join(''), text);
  assert.deepEqual(parts.filter((p) => p.hit).map((p) => p.text), ['Barking  cough', 'stridor']);
  assert.deepEqual(markHints('plain', []), [{ text: 'plain', hit: false }]);
  assert.deepEqual(markHints('', ['x']), [{ text: '', hit: false }]);
  assert.deepEqual(markHints('IgA (low)', ['(low)']).filter((p) => p.hit).map((p) => p.text), ['(low)']);
});

test('copies of the same question are listed apart from similar ones', async () => {
  const { sameOf, similarOf } = await import('./questionHints.js');
  const q = { same: { a1: true, b2: true }, similar: { a1: true, c3: true } };
  assert.deepEqual(sameOf(q), ['a1', 'b2']);
  assert.deepEqual(similarOf(q), ['c3']);
  assert.deepEqual(sameOf({}), []);
});

test('linked (related) questions leave out copies and similar ones', async () => {
  const { relatedOf } = await import('./questionHints.js');
  const q = { same: { a1: true }, similar: { c3: true }, related: { a1: true, c3: true, d4: true, e5: false } };
  assert.deepEqual(relatedOf(q), ['d4']);
  assert.deepEqual(relatedOf({}), []);
});
