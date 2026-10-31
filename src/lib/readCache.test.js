import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheGet, cachePatch, cachePut, cacheSet, whereKey, _internal } from './readCache.js';

const tick = () => new Promise((r) => setTimeout(r, 5));

test('a write to a child updates the saved parent', async () => {
  await cachePut('quizusers/u1', { total_play: '757', over_all: '72', name: 'Q' });
  cachePatch('quizusers/u1', { total_play: '760', date: 'x' });
  await tick();
  assert.deepEqual(await cacheGet('quizusers/u1'), { total_play: '760', over_all: '72', name: 'Q', date: 'x' });
});

test('a deep update path ("a/b" keys) lands in the right place', async () => {
  await cachePut('quizperf/u1', { v: '2', days: { '2026-10-30': { played: '5', correct: '4' } } });
  cachePatch('quizperf/u1', { 'days/2026-10-31': { played: '3', correct: '2' } });
  await tick();
  const v = await cacheGet('quizperf/u1');
  assert.equal(v.v, '2');
  assert.deepEqual(Object.keys(v.days).sort(), ['2026-10-30', '2026-10-31']);
});

test('a write to the parent updates a saved child, and remove clears it', async () => {
  await cachePut('quizhistory/u1/quizA', { q1: '1' });
  cacheSet('quizhistory/u1', { quizA: { q1: '0', q2: '1' } });
  await tick();
  assert.deepEqual(await cacheGet('quizhistory/u1/quizA'), { q1: '0', q2: '1' });
  cacheSet('quizhistory/u1', null);
  await tick();
  assert.equal(await cacheGet('quizhistory/u1/quizA'), null);
});

test('unrelated paths are left alone', async () => {
  await cachePut('quizstats/u2', { a: { title: 'A' } });
  cachePatch('quizstats/u22', { b: 1 });
  cacheSet('quizstats/u2x', null);
  await tick();
  assert.deepEqual(await cacheGet('quizstats/u2'), { a: { title: 'A' } });
});

test('saved filtered lists follow edits and removals of their rows', async () => {
  const key = whereKey('resume', 'uid', 'u1');
  await cachePut(key, [{ _key: 'p1', uid: 'u1', played: '26', tq: '55' }, { _key: 'p2', uid: 'u1', played: '3' }]);
  cachePatch('resume/p1', { played: '27' });
  cacheSet('resume/p2', null);
  await tick();
  assert.deepEqual(await cacheGet(key), [{ _key: 'p1', uid: 'u1', played: '27', tq: '55' }]);
});

test('setIn does not mutate the saved object', () => {
  const a = { x: { y: 1 } };
  const b = _internal.setIn(a, ['x', 'z'], 2);
  assert.deepEqual(a, { x: { y: 1 } });
  assert.deepEqual(b, { x: { y: 1, z: 2 } });
});

test('a new matching row joins a saved filtered list, other users do not', async () => {
  const key = whereKey('resume', 'uid', 'u9');
  await cachePut(key, []);
  cachePatch('resume/n1', { played: '4', tq: '20', uid: 'u9', title: 'T' });
  cachePatch('resume/n2', { played: '1', uid: 'other' });
  await tick();
  assert.deepEqual(await cacheGet(key), [{ _key: 'n1', played: '4', tq: '20', uid: 'u9', title: 'T' }]);
});
