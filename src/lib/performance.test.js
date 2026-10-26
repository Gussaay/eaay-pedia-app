import test from 'node:test';
import assert from 'node:assert/strict';
import { addCounts, dayKey, lastDays, rankTopics, rowsOf, safeKey, streakOf, tallyTopics, topicOf, totalOf } from './performance.js';

test('the topic comes from the question, never the quiz marker "?"', () => {
  const q = {
    chapter: 'Cardiology',
    science: 'Pharmacology',
    tags: { 'long-qt-syndrome': 'Long QT syndrome', 'qt-drugs': 'QT drugs' },
    topic: 'qt-drugs',
  };
  assert.deepEqual(topicOf(q), {
    chapter: 'Cardiology',
    science: 'Pharmacology',
    tag: { slug: 'qt-drugs', label: 'QT drugs' },
  });
  // No browse fields: the category is read like the browse script does.
  assert.equal(topicOf({ category1: 'cardio', question: 'x' }).chapter, 'Cardiology');
  assert.equal(topicOf({ question: 'x' }).tag, null);
});

test('answers are counted by system, science and tag', () => {
  const a = { chapter: 'Neonatology', science: 'Clinical', tags: { jaundice: 'Jaundice' } };
  const b = { chapter: 'Neonatology', science: 'Clinical' };
  const t = tallyTopics([
    { q: a, ok: true },
    { q: a, ok: false },
    { q: b, ok: true },
    { q: null, ok: true },
  ]);
  assert.deepEqual(t.chapters.Neonatology, { name: 'Neonatology', played: 3, correct: 2 });
  assert.deepEqual(t.tags.jaundice, { name: 'Jaundice', played: 2, correct: 1 });
  assert.equal(safeKey('Ethics & law'), 'Ethics & law');
  assert.equal(safeKey('a.b/c'), 'a_b_c');
});

test('stored counts add up and read back with accuracy', () => {
  const sum = addCounts({ x: { name: 'X', played: '4', correct: '1' } }, { x: { name: 'X', played: 2, correct: 2 } });
  assert.deepEqual(sum.x, { name: 'X', played: 6, correct: 3 });
  assert.deepEqual(rowsOf({ x: { name: 'X', played: '4', correct: '3' }, y: { played: '0' } }), [
    { key: 'x', name: 'X', played: 4, correct: 3, accuracy: 75 },
  ]);
});

test('days, streaks and weekly totals', () => {
  const now = new Date('2026-10-26T10:00:00').getTime();
  const day = (n) => dayKey(now - n * 86_400_000);
  const days = { [day(1)]: { played: '5', correct: '4' }, [day(2)]: { played: '5', correct: '1' }, [day(4)]: { played: '2' } };
  assert.equal(dayKey(now), '2026-10-26');
  const list = lastDays(days, 7, now);
  assert.equal(list.length, 7);
  assert.equal(list[6].day, '2026-10-26');
  assert.equal(list[5].played, 5);
  // Today not played yet: the streak still runs from yesterday.
  assert.equal(streakOf(days, now), 2);
  assert.equal(streakOf({}, now), 0);
  assert.deepEqual(totalOf(list), { played: 12, correct: 5, accuracy: 42 });
  assert.equal(totalOf([]).accuracy, null);
});

test('specific topics need enough answers to rank', () => {
  const rows = [
    { key: 'a', played: 5, correct: 1, accuracy: 20 },
    { key: 'b', played: 2, correct: 0, accuracy: 0 },
    { key: 'c', played: 4, correct: 4, accuracy: 100 },
  ];
  const r = rankTopics(rows, 3);
  assert.equal(r.enough, 2);
  assert.deepEqual(r.weak.map((t) => t.key), ['a', 'c']);
  assert.deepEqual(r.strong.map((t) => t.key), ['c', 'a']);
});
