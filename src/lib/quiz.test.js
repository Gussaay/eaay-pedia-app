import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  visibleOptions, isCorrect, planSession, examDurationMs, formatDuration,
  computeSessionResult, rating, answerStats, matchesChapter,
  planDeck, historyCounts, tallyAnswers, encodeDeck, decodeDeck, encodeAnswers, decodeAnswers,
} from './quiz.js';

test('visibleOptions hides empty options and E for smsb', () => {
  const q = { a: 'x', b: 'y', c: '', d: 'z', e: 'w' };
  assert.deepEqual(visibleOptions(q), ['a', 'b', 'd', 'e']);
  assert.deepEqual(visibleOptions(q, 'smsb'), ['a', 'b', 'd']);
});

test('isCorrect is case/space tolerant', () => {
  assert.equal(isCorrect({ answer: ' B ' }, 'b'), true);
  assert.equal(isCorrect({ answer: 'b' }, ''), false);
});

test('planSession matches the Android choices', () => {
  assert.deepEqual(planSession(40, 'all'), { start: 0, count: 40 });
  assert.deepEqual(planSession(40, 'count', 10), { start: 0, count: 10 });
  assert.deepEqual(planSession(40, 'count', 99), { start: 0, count: 40 });
  assert.deepEqual(planSession(40, 'from', 11), { start: 10, count: 30 });
  assert.ok(planSession(40, 'from', 41).error);
  assert.ok(planSession(40, 'count', 0).error);
});

test('exam timer is 30s per question', () => {
  assert.equal(examDurationMs(10), 5 * 60 * 1000);
  assert.equal(formatDuration(65_000), '01:05');
  assert.equal(formatDuration(3_725_000), '1:02:05');
});

test('computeSessionResult: first attempt', () => {
  const r = computeSessionResult({ correct: 7, played: 10 }, {});
  assert.equal(r.percentage, 70);
  assert.equal(r.quizPerformance, 70);
  assert.equal(r.trial, 1);
  assert.equal(r.overall, 70);
  assert.equal(r.newBest, true);
});

test('computeSessionResult: averages with previous performance', () => {
  const r = computeSessionResult(
    { correct: 5, played: 10 },
    { totalPlay: 10, totalCorrect: 9, trial: 1, quizPerformance: 90, previousPoints: 9 },
  );
  assert.equal(r.quizPerformance, 70);
  assert.equal(r.overall, 70);
  assert.equal(r.trial, 2);
  assert.equal(r.newBest, false);
});

test('computeSessionResult returns null when nothing was answered', () => {
  assert.equal(computeSessionResult({ correct: 0, played: 0 }), null);
});

test('rating thresholds', () => {
  assert.equal(rating(49), 'poor');
  assert.equal(rating(50), 'good');
  assert.equal(rating(80), 'good');
  assert.equal(rating(81), 'excellent');
});

test('answerStats', () => {
  const dq = { readK: '4', 'answer AK': '1', 'answer BK': '3' };
  assert.deepEqual(answerStats(dq, 'K'), { a: 25, b: 75, c: 0, d: 0, e: 0 });
});

test('matchesChapter', () => {
  assert.equal(matchesChapter({ category1: 'Cardio', type: 'part1' }, 'Cardio', 'part1'), true);
  assert.equal(matchesChapter({ category2: 'Cardio', type: 'part2' }, 'Cardio', 'part1'), false);
});

// ---------------------------------------------------------------- decks
const bank = [
  { _key: 'q1', answer: 'a' },
  { _key: 'q2', answer: 'b' },
  { _key: 'q3', answer: 'c' },
  { _key: 'q4', answer: 'd' },
];

test('planDeck turns the slice options into positions', () => {
  assert.deepEqual(planDeck(bank, 'all').deck, [0, 1, 2, 3]);
  assert.deepEqual(planDeck(bank, 'count', '2').deck, [0, 1]);
  assert.deepEqual(planDeck(bank, 'from', '3').deck, [2, 3]);
  assert.equal(planDeck(bank, 'from', '9').error, 'Choose a smaller number');
});

test('planDeck picks out the unanswered and the wrongly answered', () => {
  const history = { q1: 1, q2: 0, q3: 0 };
  assert.deepEqual(planDeck(bank, 'unseen', null, history).deck, [3]);
  assert.deepEqual(planDeck(bank, 'wrong', null, history).deck, [1, 2]);
});

test('planDeck explains itself when a filter leaves nothing to play', () => {
  const all = { q1: 1, q2: 1, q3: 1, q4: 1 };
  assert.match(planDeck(bank, 'unseen', null, all).error, /answered every question/);
  assert.match(planDeck(bank, 'wrong', null, all).error, /no wrong answers/);
});

test('historyCounts splits the bank three ways', () => {
  assert.deepEqual(historyCounts(bank, { q1: 1, q2: '0' }), { total: 4, unseen: 2, wrong: 1, right: 1 });
});

test('tallyAnswers counts the answers themselves, so a changed answer re-counts', () => {
  const deck = [0, 1, 2];
  assert.deepEqual(tallyAnswers(deck, bank, { 0: 'a', 1: 'a' }), { played: 2, correct: 1 });
  // The same question answered again in exam mode, this time correctly.
  assert.deepEqual(tallyAnswers(deck, bank, { 0: 'a', 1: 'b' }), { played: 2, correct: 2 });
});

test('a deck and its answers survive a round trip through the database', () => {
  const deck = [3, 7, 11];
  const answers = { 0: 'a', 2: 'e' };
  assert.deepEqual(decodeDeck(encodeDeck(deck)), deck);
  assert.deepEqual(decodeAnswers(encodeAnswers(answers)), answers);
  assert.deepEqual(decodeDeck(''), []);
  assert.deepEqual(decodeAnswers(''), {});
});
