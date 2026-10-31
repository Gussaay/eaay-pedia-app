import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyPush, dailyRecord, newPushKey, pickDaily, pushKeyTime, seeded, sudanDay, usableQuestion } from './dailyPick.js';

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

test('newPushKey round-trips its time and sorts by time', () => {
  const t = Date.UTC(2026, 9, 31, 5, 0);
  const k = newPushKey(t, () => 0.5);
  assert.equal(k.length, 20);
  assert.equal(pushKeyTime(k), t);
  assert.ok(newPushKey(t + 1000) > newPushKey(t));
});

test('dailyPush shortens long stems and opens the question', () => {
  const p = dailyPush({ question: `A  2-year-old\nwith ${'x'.repeat(200)}` }, 5);
  assert.equal(p.body.length, 108);
  assert.ok(p.body.startsWith('A 2-year-old with'));
  assert.equal(p.url, '/?daily=1');
  assert.equal(p.target, 'all');
  assert.equal(dailyPush({ question: 'Short?' }, 5).body, 'Short?');
});

// The 7 am Cloud Function (functions/daily.js) carries its own copy of the pick.
test('the Cloud Function picks and writes the same as this file', async () => {
  const fn = await import('../../functions/dailyCore.js');
  const entries = Array.from({ length: 50 }, (_, i) => [`k${i}`, q({ exp: i % 3 ? 'because' : '' })]);
  for (const day of ['2026-10-31', '2026-11-01', '2027-02-14']) {
    assert.deepEqual(fn.pickDaily(entries, day), pickDaily(entries, day));
    assert.equal(fn.sudanDay(Date.parse(`${day}T05:00:00Z`)), sudanDay(Date.parse(`${day}T05:00:00Z`)));
  }
  assert.deepEqual(fn.dailyRecord('k1', q(), 'd'), dailyRecord('k1', q(), 'd'));
  assert.deepEqual(fn.dailyPush(q(), 5), dailyPush(q(), 5));
  assert.equal(fn.pushKeyTime(fn.newPushKey(123456789)), 123456789);
});

test('runDaily posts once, then only notifies, then does nothing', async () => {
  const { runDaily } = await import('../../functions/dailyCore.js');
  const data = { quizqq: { k1: q(), k2: q({ key: 'prev' }) }, allquiz: { p: { key: 'prev', preview: 'true' } }, dailyquizz: {} };
  const get = (path) => path.split('/').reduce((o, k) => o?.[k], data);
  const ref = (path = '') => ({
    get: async () => ({ val: () => get(path) }),
    orderByKey: () => ({ limitToLast: () => ({ get: async () => {
      const keys = Object.keys(data.dailyquizz).sort();
      const k = keys[keys.length - 1];
      return { val: () => (k ? { [k]: data.dailyquizz[k] } : null) };
    } }) }),
    update: async (u) => {
      // Like the real database: no path may sit under another in one update.
      const paths = Object.keys(u);
      for (const a of paths) for (const b of paths) assert.ok(!b.startsWith(`${a}/`), `${a} is an ancestor of ${b}`);
      for (const [p, v] of Object.entries(u)) {
        const parts = p.split('/');
        let o = data;
        for (const k of parts.slice(0, -1)) o = o[k] ??= {};
        o[parts.at(-1)] = v;
      }
    },
  });
  const db = { ref };
  const now = Date.parse('2026-10-31T05:00:00Z');
  assert.match(await runDaily(db, now), /picked k1 from 1; posted and sent/);
  const [key] = Object.keys(data.dailyquizz);
  assert.equal(data.dailyquizz[key].notified, '1');
  assert.equal(Object.keys(data.push_outbox).length, 1);
  assert.match(await runDaily(db, now + 3600_000), /already posted and sent/);
  assert.equal(Object.keys(data.push_outbox).length, 1);
  // An admin's own question posted today, not yet sent: only its push goes out.
  delete data.dailyquizz[key];
  data.dailyquizz['-Oz'] = { question: 'Admin?', day: '2026-10-31' };
  assert.match(await runDaily(db, now), /was posted; sent its notification/);
  assert.equal(Object.keys(data.push_outbox).length, 2);
});
