import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyRecord, pickDaily, pushKeyTime, seeded, sudanDay, usableQuestion } from './dailyPick.js';

const q = (over = {}) => ({ question: 'Stem?', a: 'one', b: 'two', answer: 'B', exp: 'because', ...over });

test('sudanDay is the UTC+2 calendar day', () => {
  assert.equal(sudanDay(Date.UTC(2026, 9, 30, 21, 59)), '2026-10-30');
  assert.equal(sudanDay(Date.UTC(2026, 9, 30, 22, 1)), '2026-10-31');
});

test('pushKeyTime reads the time out of a push key', () => {
  // "-" is 0, so a key of eight dashes is time 0; "0" adds one 64^7 step.
  assert.equal(pushKeyTime('--------abc'), 0);
  assert.equal(pushKeyTime('-------0'), 1);
  assert.equal(pushKeyTime('------0-'), 64);
  assert.equal(pushKeyTime('bad key!'), 0);
});

test('seeded is stable and in [0, 1)', () => {
  assert.equal(seeded('x'), seeded('x'));
  assert.notEqual(seeded('daily:2026-10-30'), seeded('daily:2026-10-31'));
  for (const s of ['a', 'b', 'daily:2026-01-01']) assert.ok(seeded(s) >= 0 && seeded(s) < 1);
});

test('usableQuestion needs a stem, two options and an answer among them', () => {
  assert.ok(usableQuestion(q()));
  assert.ok(!usableQuestion(q({ question: ' ' })));
  assert.ok(!usableQuestion(q({ b: '' })));
  assert.ok(!usableQuestion(q({ answer: 'd' })));
});

test('pickDaily is the same for any order of the bank and prefers explained questions', () => {
  const entries = [['k3', q()], ['k1', q()], ['k2', q({ exp: '' })], ['k4', q({ answer: '' })]];
  const day = '2026-10-30';
  const a = pickDaily(entries, day);
  const b = pickDaily([...entries].reverse(), day);
  assert.equal(a[0], b[0]);
  assert.ok(['k1', 'k3'].includes(a[0]));
  assert.equal(pickDaily([['k4', q({ answer: '' })]], day), null);
});

test('dailyRecord keeps only what the daily card shows', () => {
  const r = dailyRecord('k1', q({ c: 'three', key: 'quiz', similar: 'x' }), '2026-10-30');
  assert.deepEqual(r, { question: 'Stem?', answer: 'b', auto: '1', day: '2026-10-30', qid: 'k1', a: 'one', b: 'two', c: 'three', exp: 'because' });
});
