import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiActivity, aiActivityRange, logLines, taskLabel } from './aiActivity.js';

const log = {
  a: { uid: 'u1', name: 'Sara', task: 'explain', what: 'A child with…', requests: 1, status: 'ok', at: 1, limit: 20, pool: 200 },
  b: { uid: 'u1', name: 'Sara', task: 'agent', what: 'Quiz me', requests: 3, status: 'ok', at: 3, limit: 18, pool: 210 },
  c: { uid: 'u2', email: 'x@y.z', task: 'quiz', what: 'Kawasaki', requests: 0, status: 'limit', at: 2, limit: 18, pool: 210 },
  d: { uid: 'boss', task: 'chat', requests: 1, status: 'error', error: 'busy', at: 4, staff: true, limit: 0, pool: 210 },
};

test('lines come newest first', () => {
  assert.deepEqual(logLines(log).map((l) => l.id), ['d', 'b', 'c', 'a']);
});

test('each person: requests, % of own limit and % of the pool', () => {
  const r = aiActivity({ log, users: { u1: 4, u2: 18 }, days: { m1: { used: 20 }, m2: { used: 3 } } });
  assert.equal(r.pool, 210);
  assert.equal(r.poolUsed, 23);
  assert.equal(r.poolPct, 11);
  const [u2, u1, boss] = r.rows;
  assert.equal(u2.uid, 'u2');
  assert.equal(u2.ofLimit, 100);
  assert.equal(u2.limited, 1);
  assert.equal(u1.requests, 4);
  assert.equal(u1.limit, 18); // the newest line's limit
  assert.equal(u1.ofLimit, 22.2);
  assert.equal(u1.ofPool, 1.9);
  assert.deepEqual(u1.tasks, { explain: 1, agent: 1 });
  assert.equal(boss.staff, true);
  assert.equal(boss.ofLimit, null);
  assert.equal(boss.errors, 1);
  assert.deepEqual(r.tasks, { explain: 1, agent: 1, quiz: 1, chat: 1 });
});

test('an empty day', () => {
  const r = aiActivity({});
  assert.equal(r.people, 0);
  assert.equal(r.poolPct, null);
  assert.equal(taskLabel('mnemonic'), 'Mnemonic');
});

test('cumulative use adds days up and compares with all their allowance and pool', () => {
  const day1 = { day: '2026-10-24', log: { a: { uid: 'u1', task: 'chat', requests: 2, status: 'ok', at: 1, limit: 20, pool: 200 } }, users: { u1: 2 }, days: { m: { used: 10 } } };
  const day2 = { day: '2026-10-25', log, users: { u1: 4, u2: 18 }, days: { m1: { used: 20 }, m2: { used: 3 } } };
  const r = aiActivityRange([day2, day1]);
  assert.equal(r.pool, 410);
  assert.equal(r.poolUsed, 33);
  const u1 = r.rows.find((p) => p.uid === 'u1');
  assert.equal(u1.requests, 6);
  assert.equal(u1.daysUsed, 2);
  assert.equal(u1.limit, 38); // 18 + 20
  assert.equal(u1.ofLimit, 15.8);
  assert.deepEqual(u1.tasks, { explain: 1, agent: 1, chat: 1 });
  assert.equal(r.days.length, 2);
  assert.equal(r.lines[0].day, '2026-10-25');
});
