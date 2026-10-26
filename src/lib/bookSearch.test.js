import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keywords, rerank } from '../../functions/bookRank.js';

test('keywords drop stop words and short words but keep numbers', () => {
  assert.deepEqual(keywords('What is the dose of IV ceftriaxone in a 2-year-old?'), ['dose', 'ceftriaxone', '2-year-old']);
});

test('a passage naming the exact drug overtakes a slightly closer one by meaning', () => {
  const out = rerank('ceftriaxone dose in meningitis', [
    { score: 0.82, text: 'Antibiotic therapy for bacterial infections in children is chosen by age.' },
    { score: 0.8, text: 'Ceftriaxone 100 mg/kg once daily is the first-line dose in meningitis.' },
    { score: 0.6, text: 'Fluids in dehydration.' },
  ]);
  assert.match(out[0].text, /^Ceftriaxone/);
  assert.equal(out[2].text, 'Fluids in dehydration.');
});
