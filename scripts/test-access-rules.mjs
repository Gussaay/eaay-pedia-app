// Checks the access and unlock-request rules in database.rules.json against the
// Firebase emulator. Needs Java, then: npm i --no-save firebase-tools @firebase/rules-unit-testing
// Run: npx firebase emulators:exec --only database --project demo-ep "node scripts/test-access-rules.mjs"
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, set, update, get, query, orderByChild, equalTo } from 'firebase/database';
import { indexEntries } from '../src/lib/accessIndex.js';
import fs from 'fs';
const env = await initializeTestEnvironment({ projectId: 'demo-ep', database: { host: '127.0.0.1', port: 9000, rules: fs.readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8') } });
const as = (uid, email) => env.authenticatedContext(uid, { email }).database();
const su = as('su', 'gussaay@gmail.com'), mal = as('mal', 'malazmuzamil55@gmail.com'), u1 = as('u1', 'a@b.c'), u2 = as('u2', 'x@y.z'), mgr = as('mgr', 'm@m.m');
let n = 0; const t = async (name, p) => { try { await p; console.log('ok', name); n++; } catch (e) { console.log('FAIL', name, e.message); process.exitCode = 1; } };
await t('user cannot give self a role', assertFails(set(ref(u1, 'access/u1/role'), 'pro')));
await t('user cannot write own access record', assertFails(set(ref(u1, 'access/u1'), { plan: 'full' })));
await t('user cannot add unlock', assertFails(set(ref(u1, 'access/u1/unlocks/quiz~1'), { at: 1 })));
await t('user cannot add unlock deep', assertFails(set(ref(u1, 'access/u1/unlocks/quiz~1/at'), 1)));
await t('user cannot add unlock deeper', assertFails(set(ref(u1, 'access/u1/unlocks/quiz~1/at/x'), 1)));
await t('user cannot start trial', assertFails(update(ref(u1, 'access/u1/trial'), { end: 9e12 })));
await t('user cannot change config', assertFails(set(ref(u1, 'access_config/enabled'), false)));
await t('superuser makes manager', assertSucceeds(set(ref(su, 'access/mgr/role'), 'manager')));
await t('superuser config', assertSucceeds(set(ref(su, 'access_config'), { enabled: true, default_plan: 'locked', partial_count: 10, trial_days: 7 })));
await t('manager sets editor', assertSucceeds(set(ref(mgr, 'access/u2/role'), 'editor')));
await t('manager cannot make manager', assertFails(set(ref(mgr, 'access/u1/role'), 'manager')));
await t('manager cannot demote manager', assertFails(set(ref(mgr, 'access/mgr/role'), 'user')));
await t('bad role rejected', assertFails(set(ref(su, 'access/u1/role'), 'superuser')));
await t('manager grants unlock', assertSucceeds(set(ref(mgr, 'access/u1/unlocks/quiz~1'), { at: 1, by: 'm', title: 't' })));
await t('manager starts trial', assertSucceeds(update(ref(mgr, 'access/u1'), { trial: { start: 1, end: 2, by: 'm' } })));
await t('manager multi-path approve', assertSucceeds(update(ref(mgr), { 'unlock_requests/u1/quiz~2/status': 'approved', 'access/u1/unlocks/quiz~2': { at: 1, until: null } })));
await t('malaz with no role is manager', assertSucceeds(set(ref(mal, 'access/u2/plan'), 'full')));
await t('editor cannot manage', assertFails(set(ref(u2, 'access/u1/plan'), 'full')));
await t('user sends own pending request', assertSucceeds(set(ref(u1, 'unlock_requests/u1/quiz~3'), { type: 'quiz', id: '3', title: 'x', status: 'pending', at: 1 })));
await t('user cannot approve own', assertFails(set(ref(u1, 'unlock_requests/u1/quiz~3/status'), 'approved')));
await t('user cannot send approved', assertFails(set(ref(u1, 'unlock_requests/u1/quiz~4'), { status: 'approved' })));
await t('user cannot request for other', assertFails(set(ref(u1, 'unlock_requests/u2/quiz~4'), { status: 'pending' })));
await t('manager declines', assertSucceeds(update(ref(mgr, 'unlock_requests/u1/quiz~3'), { status: 'denied', decided_at: 2 })));
await t('user re-requests after decline', assertSucceeds(update(ref(u1, 'unlock_requests/u1/quiz~3'), { status: 'pending', at: 3 })));
await t('user reads own access', assertSucceeds(get(ref(u1, 'access/u1'))));
await t('other default nodes still writable', assertSucceeds(set(ref(u1, 'quizusers/u1/name'), 'A')));

// ---- the quiz lock on questions (holds for the old app too)
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.database();
  await set(ref(db, 'quizqq'), {
    q1: { key: 'K1', source: 'fopsample', bchap: 'mrcpch|Cardiology', question: 'x' },
    q2: { key: 'K2', source: 'tasrecall', bchap: 'mrcpch|Cardiology', question: 'y' },
  });
  // Seeded the way the index script and admin screens write it.
  await update(ref(db), {
    ...indexEntries({ quizKey: 'K1', source: 'fopsample', bank: 'mrcpch', group: 'FOP', bchap: 'mrcpch|Cardiology' }),
    ...indexEntries({ quizKey: 'K2', source: 'tasrecall', bank: 'mrcpch', group: 'TAS' }),
  });
  await set(ref(db, 'access/g1'), { unlocks: { 'group~mrcpch|FOP': { at: 1 } } });
  await set(ref(db, 'access/b1'), { unlocks: { 'bank~mrcpch': { at: 1 } } });
  await set(ref(db, 'access/x1'), { unlocks: { 'group~mrcpch|FOP': { at: 1, until: 1 } } });
  await set(ref(db, 'access/t1'), { trial: { start: 1, end: Date.now() + 86400000 } });
  await set(ref(db, 'access/t2'), { trial: { start: 1, end: 2 } });
  await set(ref(db, 'access/p1'), { role: 'pro' });
  await set(ref(db, 'access_config'), { enabled: true, default_plan: 'locked' });
});
const lk = as('lk', 'lk@x.y'), g1 = as('g1', 'g@x.y'), b1 = as('b1', 'b@x.y'), x1 = as('x1', 'x@x.y'), t1 = as('t1', 't@x.y'), t2 = as('t2', 't2@x.y'), p1 = as('p1', 'p@x.y');
const byKey = (db, k) => get(query(ref(db, 'quizqq'), orderByChild('key'), equalTo(k)));
const bySrc = (db, k) => get(query(ref(db, 'quizqq'), orderByChild('source'), equalTo(k)));
const byChap = (db, k) => get(query(ref(db, 'quizqq'), orderByChild('bchap'), equalTo(k)));
await t('locked: whole question list refused (old app)', assertFails(get(ref(lk, 'quizqq'))));
await t('locked: quiz by key refused', assertFails(byKey(lk, 'K1')));
await t('locked: one question refused', assertFails(get(ref(lk, 'quizqq/q1'))));
await t('locked: chapter set refused', assertFails(byChap(lk, 'mrcpch|Cardiology')));
await t('locked: quiz list and other nodes still readable', assertSucceeds(get(ref(lk, 'allquiz'))));
await t('group unlock: its quiz by key', assertSucceeds(byKey(g1, 'K1')));
await t('group unlock: its book by source', assertSucceeds(bySrc(g1, 'fopsample')));
await t('group unlock: its question', assertSucceeds(get(ref(g1, 'quizqq/q1'))));
await t('group unlock: other group refused', assertFails(byKey(g1, 'K2')));
await t('group unlock: other question refused', assertFails(get(ref(g1, 'quizqq/q2'))));
await t('group unlock: whole list refused', assertFails(get(ref(g1, 'quizqq'))));
await t('group unlock: chapter set needs the bank', assertFails(byChap(g1, 'mrcpch|Cardiology')));
await t('bank unlock: any quiz in the bank', assertSucceeds(byKey(b1, 'K2')));
await t('bank unlock: chapter set', assertSucceeds(byChap(b1, 'mrcpch|Cardiology')));
await t('expired unlock refused', assertFails(byKey(x1, 'K1')));
await t('trial: whole list', assertSucceeds(get(ref(t1, 'quizqq'))));
await t('ended trial refused', assertFails(get(ref(t2, 'quizqq'))));
await t('pro: whole list', assertSucceeds(get(ref(p1, 'quizqq'))));
await t('superuser: whole list', assertSucceeds(get(ref(su, 'quizqq'))));
await t('editor: whole list', assertSucceeds(get(ref(u2, 'quizqq'))));
await t('nobody makes themselves admin', assertFails(set(ref(lk, 'quizusers/lk/admin'), 'true')));
await t('own profile still writable', assertSucceeds(update(ref(lk, 'quizusers/lk'), { name: 'L', ver: '5' })));
await t('user cannot write the lock index', assertFails(set(ref(lk, 'qkey/K9'), 'fopsample')));
await t('statistics and resume still writable', assertSucceeds(update(ref(lk), { 'statistics/K1/review': '1', 'resume/r1': { uid: 'lk' } })));
await t('user cannot delete someone else\'s access', assertFails(set(ref(lk, 'access/g1'), null)));
await t('user cannot delete the settings', assertFails(set(ref(lk, 'access_config'), null)));
await env.withSecurityRulesDisabled(async (ctx) => set(ref(ctx.database(), 'access_config/enabled'), false));
await t('locking off: everyone reads', assertSucceeds(get(ref(lk, 'quizqq'))));
await env.cleanup();
console.log(n, 'passed');
