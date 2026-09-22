import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSpot,
  describeSpot,
  isFresh,
  listSpots,
  loadSpot,
  saveSpot,
  trimSpots,
  useStoreForTests,
} from './resume.js';

function fakeStore() {
  let data = {};
  return {
    get: () => JSON.parse(JSON.stringify(data)),
    set: (all) => {
      data = JSON.parse(JSON.stringify(all));
    },
    raw: () => data,
  };
}

const DAY = 24 * 60 * 60 * 1000;

test('a place is remembered and comes back', () => {
  useStoreForTests(fakeStore());
  saveSpot('flash', 'deck1', { done: 7, total: 20, queue: ['a', 'b'] });
  const back = loadSpot('flash', 'deck1');
  assert.equal(back.done, 7);
  assert.equal(back.total, 20);
  assert.deepEqual(back.queue, ['a', 'b']);
  assert.equal(typeof back.at, 'number');
});

test('kinds and ids do not collide', () => {
  useStoreForTests(fakeStore());
  saveSpot('flash', 'x', { done: 1 });
  saveSpot('quiz', 'x', { done: 2 });
  assert.equal(loadSpot('flash', 'x').done, 1);
  assert.equal(loadSpot('quiz', 'x').done, 2);
  assert.equal(loadSpot('flash', 'other'), null);
});

test('clearing one leaves the others alone', () => {
  useStoreForTests(fakeStore());
  saveSpot('flash', 'a', { done: 1 });
  saveSpot('flash', 'b', { done: 2 });
  clearSpot('flash', 'a');
  assert.equal(loadSpot('flash', 'a'), null);
  assert.equal(loadSpot('flash', 'b').done, 2);
});

test('a place older than two weeks is not offered', () => {
  const now = Date.now();
  assert.equal(isFresh({ at: now - 1000 }, now), true);
  assert.equal(isFresh({ at: now - 13 * DAY }, now), true);
  assert.equal(isFresh({ at: now - 15 * DAY }, now), false);
  assert.equal(isFresh(null, now), false);
  assert.equal(isFresh({}, now), false, 'an entry with no timestamp is not trusted');
});

test('stale entries are dropped and only the newest few are kept', () => {
  const now = Date.now();
  const all = { stale: { at: now - 30 * DAY, done: 1 } };
  for (let i = 0; i < 25; i += 1) all[`k${i}`] = { at: now - i * 1000, done: i };

  const kept = trimSpots(all, now);
  assert.equal(Object.keys(kept).length, 20);
  assert.equal(kept.stale, undefined, 'the old one should be gone');
  assert.ok(kept.k0, 'the newest should survive');
  assert.equal(kept.k24, undefined, 'the oldest of the fresh ones should be trimmed');
});

test('saving prunes, so a daily user does not fill up storage', () => {
  const fake = fakeStore();
  useStoreForTests(fake);
  for (let i = 0; i < 30; i += 1) saveSpot('flash', `deck${i}`, { done: i });
  assert.equal(Object.keys(fake.raw()).length, 20);
  assert.ok(loadSpot('flash', 'deck29'), 'the most recent is kept');
});

test('saved places are listed newest first, even when saved in the same millisecond', () => {
  useStoreForTests(fakeStore());
  saveSpot('quiz', 'q1', { done: 1 });
  saveSpot('flash', 'd1', { done: 2 });
  const list = listSpots();
  assert.equal(list.length, 2);
  assert.equal(list[0].kind, 'flash');
  assert.equal(list[0].id, 'd1');
  assert.equal(list[1].kind, 'quiz');
});

test('an id containing a colon still round-trips', () => {
  useStoreForTests(fakeStore());
  saveSpot('quiz', 'bysystem:cardiology', { done: 3 });
  assert.equal(loadSpot('quiz', 'bysystem:cardiology').done, 3);
  assert.equal(listSpots()[0].id, 'bysystem:cardiology');
});

test('the Continue label says how far through you were', () => {
  assert.equal(describeSpot({ at: Date.now(), done: 6, total: 20 }), 'Continue from card 7 of 20');
  assert.equal(describeSpot({ at: Date.now(), done: 0, total: 5 }), 'Continue from card 1 of 5');
  // Never promises a card past the end.
  assert.equal(describeSpot({ at: Date.now(), done: 20, total: 20 }), 'Continue from card 20 of 20');
  assert.equal(describeSpot(null), '');
});

test('a missing id is ignored rather than throwing', () => {
  useStoreForTests(fakeStore());
  saveSpot('flash', '', { done: 1 });
  assert.equal(loadSpot('flash', ''), null);
  clearSpot('flash', undefined);
});
