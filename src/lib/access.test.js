import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accessGroup, accessState, assignableRoles, bookScopes, groupScopes, quizAccess, readConfig, roleOf, scopeKey,
  scopesOf, unlockChoices, visibleQuestions,
} from './access.js';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const DAY = 86_400_000;

test('the superuser is decided by email and cannot be changed by a record', () => {
  assert.equal(roleOf({ email: 'Gussaay@gmail.com', record: { role: 'user' } }), 'superuser');
  assert.equal(roleOf({ email: 'a@b.c', record: { role: 'superuser' } }), 'user');
  assert.equal(roleOf({ email: 'a@b.c', record: { role: 'editor' } }), 'editor');
  assert.equal(roleOf({ email: 'a@b.c', legacyAdmin: true }), 'manager');
  assert.equal(roleOf({ email: 'a@b.c', record: { role: 'reviewer' }, legacyAdmin: true }), 'reviewer');
  assert.equal(roleOf({ email: 'a@b.c', record: { role: 'nonsense' } }), 'user');
});

test('only the superuser hands out the manager role', () => {
  assert.ok(assignableRoles('superuser').includes('manager'));
  assert.ok(!assignableRoles('manager').includes('manager'));
  assert.ok(!assignableRoles('superuser').includes('superuser'));
});

test('config falls back to locked, 10 questions, 7 days', () => {
  assert.deepEqual(readConfig(null), { enabled: true, default_plan: 'locked', partial_count: 10, trial_days: 7, subscriptions: false });
  assert.deepEqual(readConfig({ enabled: 'false', default_plan: 'partial', partial_count: '20', trial_days: 3, subscriptions: true }), {
    enabled: false, default_plan: 'partial', partial_count: 20, trial_days: 3, subscriptions: true,
  });
  assert.equal(readConfig({ default_plan: 'gold' }).default_plan, 'locked');
});

test('a new user gets the default plan', () => {
  assert.equal(accessState({ now: NOW }).level, 'locked');
  assert.equal(accessState({ config: { default_plan: 'partial' }, now: NOW }).level, 'partial');
  assert.equal(accessState({ config: { enabled: false }, now: NOW }).level, 'full');
});

test('staff and pro open everything; pro ends on its date', () => {
  for (const role of ['superuser', 'manager', 'editor', 'reviewer']) assert.equal(accessState({ role, now: NOW }).level, 'full');
  assert.equal(accessState({ role: 'pro', now: NOW }).level, 'full');
  assert.equal(accessState({ role: 'pro', record: { pro_until: NOW + DAY }, now: NOW }).level, 'full');
  const ended = accessState({ role: 'pro', record: { pro_until: NOW - DAY }, now: NOW });
  assert.equal(ended.level, 'locked');
  assert.equal(accessGroup(ended), 'subscribe');
});

test('a trial opens everything until it ends, then the person should subscribe', () => {
  const on = accessState({ record: { trial: { start: NOW - DAY, end: NOW + DAY } }, now: NOW });
  assert.equal(on.level, 'full');
  assert.equal(accessGroup(on), 'trial');
  const off = accessState({ record: { trial: { start: NOW - 9 * DAY, end: NOW - DAY } }, now: NOW });
  assert.equal(off.level, 'locked');
  assert.equal(accessGroup(off), 'subscribe');
});

test('an own plan wins over the default until plan_until', () => {
  assert.equal(accessState({ record: { plan: 'full' }, now: NOW }).level, 'full');
  assert.equal(accessState({ record: { plan: 'full', plan_until: NOW - 1 }, now: NOW }).level, 'locked');
});

test('scope keys are safe database keys', () => {
  assert.equal(scopeKey('chapter', 'mrcpch|Ethics & law'), 'chapter~mrcpch|Ethics & law');
  assert.equal(scopeKey('chapter', 'a/b.c#d$e[f]g%'), 'chapter~a%2Fb%2Ec%23d%24e%5Bf%5Dg%25');
});

test('scopes run from the quiz itself out to its bank', () => {
  assert.deepEqual(
    scopesOf({ kind: 'exam', id: '-N1', title: 'Paper 1', source: 'doh_haad' }, { bank: 'gulf_licensing' }).map((s) => s.key),
    ['quiz~-N1', 'book~doh_haad', 'bank~gulf_licensing'],
  );
  assert.deepEqual(
    scopesOf({ kind: 'set', bank: 'mrcpch', book: '', filterChapter: 'Cardiology', science: 'Anatomy' }).map((s) => s.key),
    ['chapter~mrcpch|Cardiology', 'science~mrcpch|Anatomy', 'bank~mrcpch'],
  );
  assert.deepEqual(scopesOf({ kind: 'set', bank: 'mrcpch', book: 'b1', filter: 'wrong' }).map((s) => s.key), ['book~b1', 'bank~mrcpch']);
  assert.deepEqual(scopesOf({ kind: 'chapter', pkey: 'c1smsb', source: 'smsb' }).map((s) => s.key), ['chapter~c1smsb', 'book~smsb']);
});

test('an unlock opens the quizzes under it, and can expire', () => {
  const scopes = scopesOf({ kind: 'exam', id: '-N1', source: 'doh_haad' }, { bank: 'gulf_licensing' });
  const state = (unlocks) => accessState({ record: { unlocks }, now: NOW });
  assert.equal(quizAccess(state({}), scopes).level, 'locked');
  assert.equal(quizAccess(state({ 'quiz~-N1': { at: NOW } }), scopes).level, 'full');
  assert.equal(quizAccess(state({ 'book~doh_haad': true }), scopes).level, 'full');
  assert.equal(quizAccess(state({ 'bank~gulf_licensing': { until: NOW - 1 } }), scopes).level, 'locked');
  assert.equal(quizAccess(state({ 'quiz~-N2': true }), scopes).level, 'locked');
});

test('partial access shows only the first questions', () => {
  const list = Array.from({ length: 30 }, (_, i) => i);
  const st = accessState({ config: { default_plan: 'partial', partial_count: 5 }, now: NOW });
  const a = quizAccess(st, []);
  assert.equal(a.level, 'partial');
  assert.deepEqual(visibleQuestions(list, a), [0, 1, 2, 3, 4]);
  assert.deepEqual(visibleQuestions(list, { level: 'locked' }), []);
  assert.equal(visibleQuestions(list, { level: 'full' }).length, 30);
});

test('a book opens through itself, its group or its bank', () => {
  const scopes = bookScopes({ source: 'fopsample', group: 'FOP', bank: 'mrcpch' });
  assert.deepEqual(scopes.map((x) => x.key), ['book~fopsample', 'group~mrcpch|FOP', 'bank~mrcpch']);
  const st = (unlocks) => accessState({ record: { unlocks }, now: NOW });
  assert.equal(quizAccess(st({ 'group~mrcpch|FOP': true }), scopes).level, 'full');
  assert.equal(quizAccess(st({ 'group~mrcpch|TAS': true }), scopes).level, 'locked');
  assert.equal(quizAccess(st({ 'group~mrcpch|FOP': true }), scopesOf({ kind: 'exam', id: 'q', source: 'fopsample' }, { bank: 'mrcpch', group: 'FOP' })).level, 'full');
  assert.deepEqual(groupScopes({ group: 'FOP', bank: 'mrcpch' }).map((x) => x.key), ['group~mrcpch|FOP', 'bank~mrcpch']);
});

test('the pop-up offers the group (or book) and the whole bank', () => {
  assert.deepEqual(
    unlockChoices({ bank: 'mrcpch', bankTitle: 'MRCPCH', group: 'FOP', book: 'fopsample' }).map((x) => [x.key, x.title]),
    [['group~mrcpch|FOP', 'MRCPCH · FOP'], ['bank~mrcpch', 'MRCPCH']],
  );
  assert.deepEqual(
    unlockChoices({ bank: 'gulf', bankTitle: 'Gulf', book: 'doh', bookTitle: 'DOH' }).map((x) => x.key),
    ['book~doh', 'bank~gulf'],
  );
});
