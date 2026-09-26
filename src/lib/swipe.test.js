import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSwipe, MIN_DISTANCE, MAX_DURATION } from './swipe.js';

test('a clean leftward flick goes forward', () => {
  assert.equal(decideSwipe({ dx: -120, dy: 10, dt: 200 }), 'forward');
});

test('a clean rightward flick goes back', () => {
  assert.equal(decideSwipe({ dx: 120, dy: -8, dt: 200 }), 'back');
});

test('a short drag is not a swipe', () => {
  assert.equal(decideSwipe({ dx: -(MIN_DISTANCE - 1), dy: 0, dt: 100 }), null);
});

test('exactly the threshold counts', () => {
  assert.equal(decideSwipe({ dx: -MIN_DISTANCE, dy: 0, dt: 100 }), 'forward');
});

test('a vertical scroll is never a swipe, however far it travels', () => {
  assert.equal(decideSwipe({ dx: -20, dy: 300, dt: 300 }), null);
});

test('a slanted scroll is rejected even when it crosses the distance', () => {
  // 100px sideways but 90px down: the reader was scrolling at an angle.
  assert.equal(decideSwipe({ dx: -100, dy: 90, dt: 300 }), null);
});

test('a gentle diagonal still counts when it stays mostly horizontal', () => {
  assert.equal(decideSwipe({ dx: -150, dy: 40, dt: 250 }), 'forward');
});

test('a slow drag is reading, not swiping', () => {
  assert.equal(decideSwipe({ dx: -200, dy: 0, dt: MAX_DURATION + 1 }), null);
});

test('a missing duration is tolerated', () => {
  assert.equal(decideSwipe({ dx: -200, dy: 0 }), 'forward');
});

test('nonsense input is refused rather than guessed at', () => {
  assert.equal(decideSwipe({}), null);
  assert.equal(decideSwipe(), null);
  assert.equal(decideSwipe({ dx: NaN, dy: 0, dt: 100 }), null);
});
