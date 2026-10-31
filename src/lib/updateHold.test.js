import test from 'node:test';
import assert from 'node:assert/strict';
import { localStamp } from './updateHold.js';

test('the hold date is written the way the Android plugin reads it', () => {
  const ms = new Date(2026, 9, 31, 7, 4, 5, 7).getTime(); // local time
  assert.equal(localStamp(ms), '2026-10-31T07:04:05.007');
  assert.match(localStamp(Date.now()), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/);
});
