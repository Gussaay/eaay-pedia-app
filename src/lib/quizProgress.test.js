import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineProgress, progressByQuiz, progressLabel, setProgress } from './quizProgress.js';

test('progressByQuiz averages every attempt and counts distinct answered questions', () => {
  const stats = { exam1: { attempts: '2', played: '100', correct: '72' } };
  const remote = { exam1: { a: '1', b: '0' }, exam2: { c: '1' } };
  const local = { exam1: { b: 1, d: 0 } };
  const p = progressByQuiz(stats, remote, local);
  assert.equal(p.exam1.attempts, 2);
  assert.equal(p.exam1.answered, 3);
  assert.equal(p.exam1.score, 72);
  assert.deepEqual([...p.exam1.ids].sort(), ['a', 'b', 'd']);
  assert.equal(p.exam2.attempts, 0);
  assert.equal(p.exam2.answered, 1);
  assert.equal(p.exam2.score, null);
});

test('progressByQuiz copes with nothing saved', () => {
  assert.deepEqual(progressByQuiz(null, undefined, {}), {});
});

test('progressLabel: done, partly done, answered only from links, not started', () => {
  assert.deepEqual(progressLabel({ attempts: 1, answered: 55, score: 72 }, 55), { done: true, text: 'Done · 72%', score: 72 });
  assert.deepEqual(progressLabel({ attempts: 1, answered: 26, score: 65 }, 55), { done: false, text: '26/55 · 65%', score: 65 });
  assert.deepEqual(progressLabel({ attempts: 0, answered: 3, score: null }, 55), { done: false, text: '3/55', score: null });
  assert.equal(progressLabel(undefined, 55), null);
  assert.equal(progressLabel({ attempts: 0, answered: 0, score: null }, 55), null);
});

test('progressLabel: more answers than questions (a question removed) still reads as done', () => {
  assert.equal(progressLabel({ attempts: 1, answered: 60, score: 80 }, 55).text, 'Done · 80%');
});

test('progressLabel: unknown size counts as done once submitted', () => {
  assert.equal(progressLabel({ attempts: 1, answered: 10, score: 90 }, 0).text, 'Done · 90%');
  assert.equal(progressLabel({ attempts: 0, answered: 10, score: null }, 0).text, 'Started');
});

test('setProgress joins a set with its parts of 100, counting a question once', () => {
  const p = progressByQuiz(
    {
      set_b_all_cardio_all: { attempts: '1', played: '10', correct: '5' },
      set_b_all_cardio_all_p2: { attempts: '1', played: '10', correct: '9' },
      set_b_all_cardio_all_linked: { attempts: '1', played: '10', correct: '0' },
      set_b_all_cardio_all_extra: { attempts: '1', played: '10', correct: '0' },
    },
    { set_b_all_cardio_all: { a: 1, b: 0 }, set_b_all_cardio_all_p2: { b: 1, c: 1 } },
  );
  const s = setProgress(p, 'set_b_all_cardio_all');
  assert.equal(s.attempts, 2);
  assert.equal(s.answered, 3);
  assert.equal(s.score, 70);
  assert.equal(setProgress(p, 'set_b_all_neuro_all'), undefined);
  assert.equal(combineProgress([]), undefined);
});

test('progressLabel: sets picked from your answers are never "done"', () => {
  const p = { attempts: 2, answered: 100, score: 64 };
  assert.equal(progressLabel(p, 100, { changing: true }).text, 'Tried 2× · 64%');
  assert.equal(progressLabel({ attempts: 1, answered: 5, score: 80 }, 100, { changing: true }).text, 'Tried once · 80%');
  assert.equal(progressLabel({ attempts: 0, answered: 5, score: null }, 100, { changing: true }), null);
});
