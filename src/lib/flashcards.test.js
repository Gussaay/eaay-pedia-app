import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOX_INTERVALS,
  addDays,
  blankProgress,
  buildSession,
  bumpStreak,
  deckSummary,
  findGaps,
  gradeCard,
  isDue,
  isMastered,
  isNew,
} from './flashcards.js';

const DAY = '2026-09-21';
const card = (key) => ({ _key: key, front: key, back: `${key} answer` });

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-09-21', 16), '2026-10-07');
  assert.equal(addDays('2026-12-28', 8), '2027-01-05');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('a new card is neither due nor mastered', () => {
  assert.equal(isNew(null), true);
  assert.equal(isNew(blankProgress()), true);
  assert.equal(isDue(null, DAY), false);
  assert.equal(isMastered(null), false);
});

test('"good" moves the card up one box and schedules it by that box', () => {
  const first = gradeCard(null, 'good', DAY);
  assert.equal(first.box, 1);
  assert.equal(first.due, addDays(DAY, BOX_INTERVALS[1]));
  assert.equal(first.seen, 1);
  assert.equal(first.right, 1);
  assert.equal(first.wrong, 0);

  const second = gradeCard(first, 'good', DAY);
  assert.equal(second.box, 2);
  assert.equal(second.due, addDays(DAY, BOX_INTERVALS[2]));
  assert.equal(second.seen, 2);
});

test('"easy" skips a box but never goes past the last one', () => {
  assert.equal(gradeCard(null, 'easy', DAY).box, 2);
  assert.equal(gradeCard({ ...blankProgress(), box: 4 }, 'easy', DAY).box, 5);
  assert.equal(gradeCard({ ...blankProgress(), box: 5 }, 'easy', DAY).box, 5);
});

test('"again" drops to box 1 and comes back inside the same session', () => {
  const learned = gradeCard(gradeCard(gradeCard(null, 'good', DAY), 'good', DAY), 'good', DAY);
  assert.equal(learned.box, 3);

  const failed = gradeCard(learned, 'again', DAY);
  assert.equal(failed.box, 1);
  assert.equal(failed.due, DAY, 'a failed card is due today, not tomorrow');
  assert.equal(isDue(failed, DAY), true);
  assert.equal(failed.wrong, 1);
  assert.equal(failed.right, 3);
});

test('grading does not mutate the record it was given', () => {
  const before = gradeCard(null, 'good', DAY);
  const snapshot = { ...before };
  gradeCard(before, 'again', DAY);
  assert.deepEqual(before, snapshot);
});

test('a card is due on its due date and every day after', () => {
  const p = gradeCard(null, 'good', DAY); // due 2026-09-22
  assert.equal(isDue(p, '2026-09-21'), false);
  assert.equal(isDue(p, '2026-09-22'), true);
  assert.equal(isDue(p, '2026-10-01'), true);
});

test('a due session leads with the most overdue card, then tops up with new ones', () => {
  const cards = [card('a'), card('b'), card('c'), card('d')];
  const progress = {
    a: { ...blankProgress(), box: 2, due: '2026-09-20' },
    b: { ...blankProgress(), box: 2, due: '2026-09-10' }, // most overdue
    c: { ...blankProgress(), box: 3, due: '2026-12-01' }, // not yet
  };
  const session = buildSession(cards, progress, { mode: 'due', limit: 10, day: DAY });
  assert.deepEqual(
    session.map((x) => x._key),
    ['b', 'a', 'd'],
  );
});

test('the session limit keeps a big deck finishable', () => {
  const cards = Array.from({ length: 200 }, (_, i) => card(`c${i}`));
  assert.equal(buildSession(cards, {}, { mode: 'due', limit: 20, day: DAY }).length, 20);
});

test('"weak" mode puts the worst-answered card first', () => {
  const cards = [card('a'), card('b'), card('c')];
  const progress = {
    a: { ...blankProgress(), box: 1, right: 1, wrong: 1 }, // 50%
    b: { ...blankProgress(), box: 1, right: 0, wrong: 3 }, // 0%
    c: { ...blankProgress(), box: 2, right: 5, wrong: 0 }, // never wrong
  };
  assert.deepEqual(
    buildSession(cards, progress, { mode: 'weak', day: DAY }).map((x) => x._key),
    ['b', 'a'],
  );
});

test('deckSummary separates new, due, learning and mastered', () => {
  const cards = [card('a'), card('b'), card('c'), card('d')];
  const progress = {
    a: { ...blankProgress(), box: 5, due: '2026-12-01', right: 4, wrong: 0 },
    b: { ...blankProgress(), box: 2, due: '2026-09-01', right: 1, wrong: 1 },
    c: { ...blankProgress(), box: 1, due: '2026-12-01', right: 0, wrong: 2 },
  };
  const s = deckSummary(cards, progress, DAY);
  assert.equal(s.total, 4);
  assert.equal(s.new, 1);
  assert.equal(s.due, 1, 'only b has come back round');
  assert.equal(s.mastered, 1);
  assert.equal(s.learning, 2);
  assert.equal(s.accuracy, 63); // 5 right of 8
  assert.equal(s.progress, 25); // 1 of 4 mastered
});

test('deckSummary reports no accuracy rather than 0% before anything is answered', () => {
  assert.equal(deckSummary([card('a')], {}, DAY).accuracy, null);
});

test('gaps rank the weakest system first and hold back thin evidence', () => {
  const decks = [
    { _key: 'd1', system: 'Cardiology', title: 'Murmurs', count: 10 },
    { _key: 'd2', system: 'Neurology', title: 'Seizures', count: 10 },
    { _key: 'd3', system: 'Renal', title: 'AKI', count: 10 },
  ];
  const progressByDeck = {
    d1: { c1: { ...blankProgress(), box: 1, right: 8, wrong: 2 } }, // 80%
    d2: { c1: { ...blankProgress(), box: 1, right: 2, wrong: 8 } }, // 20%
    d3: { c1: { ...blankProgress(), box: 1, right: 0, wrong: 1 } }, // too thin
  };
  const gaps = findGaps(decks, progressByDeck, { minAnswers: 5 });
  assert.deepEqual(
    gaps.map((g) => g.system),
    ['Neurology', 'Cardiology', 'Renal'],
  );
  assert.equal(gaps[0].accuracy, 20);
  assert.equal(gaps[2].enough, false, 'one answer is not a knowledge gap');
});

test('the streak continues from yesterday, holds today, and restarts after a gap', () => {
  assert.deepEqual(bumpStreak({ streak: 4, lastDay: '2026-09-20' }, DAY), { streak: 5, lastDay: DAY });
  assert.deepEqual(bumpStreak({ streak: 4, lastDay: DAY }, DAY), { streak: 4, lastDay: DAY });
  assert.deepEqual(bumpStreak({ streak: 9, lastDay: '2026-09-01' }, DAY), { streak: 1, lastDay: DAY });
  assert.deepEqual(bumpStreak(null, DAY), { streak: 1, lastDay: DAY });
});
