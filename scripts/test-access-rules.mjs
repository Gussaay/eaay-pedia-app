// Checks the access and unlock-request rules in database.rules.json against the
// Firebase emulator. Needs Java, then: npm i --no-save firebase-tools @firebase/rules-unit-testing
// Run: npx firebase emulators:exec --only database --project demo-ep "node scripts/test-access-rules.mjs"
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, set, update, get } from 'firebase/database';
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
await env.cleanup();
console.log(n, 'passed');
