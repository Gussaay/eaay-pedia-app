import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeUsers, dailyPool, daysBefore, perUserLimit, quotaConfig, QUOTA_DEFAULTS, userQuota } from '../../functions/aiQuota.js';

const GROQ = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
const GEMINI = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const NOW = Date.parse('2026-10-25T12:00:00Z');

test('the pool adds up every model, with Groq capped by its daily tokens', () => {
  const pool = dailyPool({ groqModels: GROQ, geminiModels: GEMINI, now: NOW });
  // 200K tokens ÷ 3,000 a request = 66 per Groq model, 20 per Gemini model.
  assert.equal(pool.total, 66 * 2 + 20 * 2);
  assert.equal(pool.left, pool.total);
});

test("today's own average replaces the guess, and reported limits replace the defaults", () => {
  const pool = dailyPool({
    groqModels: GROQ,
    geminiModels: GEMINI,
    today: { 'openai_gpt-oss-120b': { used: 10, tokens: 20000 } },
    limits: { 'gemini-flash-latest': 250 },
    now: NOW,
  });
  const big = pool.models.find((m) => m.key === 'openai_gpt-oss-120b');
  assert.equal(big.capacity, 100); // 200K ÷ 2,000
  assert.equal(pool.models.find((m) => m.key === 'gemini-flash-latest').capacity, 250);
  assert.equal(pool.used, 10);
});

test('a model closed for the day gives only what it gave, one off for the key gives nothing', () => {
  const pool = dailyPool({
    groqModels: GROQ,
    geminiModels: GEMINI,
    today: { 'gemini-flash-latest': { used: 7, resetAt: NOW + 3600_000 } },
    off: { 'gemini-flash-lite-latest': '2026-10-25' },
    now: NOW,
  });
  assert.equal(pool.models.find((m) => m.key === 'gemini-flash-latest').capacity, 7);
  assert.ok(!pool.models.some((m) => m.key === 'gemini-flash-lite-latest'));
});

test('the share is split between active people, never fewer than minActive, within min and max', () => {
  assert.equal(perUserLimit(200, 1), 17); // 170 ÷ 10
  assert.equal(perUserLimit(200, 17), 10);
  assert.equal(perUserLimit(200, 1000), QUOTA_DEFAULTS.minPerUser);
  assert.equal(perUserLimit(5000, 10), QUOTA_DEFAULTS.maxPerUser);
});

test('active people are those who used the AI in the last week, plus the caller', () => {
  const active = { a: '2026-10-25', b: '2026-10-19', c: '2026-10-18', d: '2026-09-01' };
  assert.equal(daysBefore('2026-10-25', 6), '2026-10-19');
  assert.equal(activeUsers(active, '2026-10-25'), 2);
  assert.equal(activeUsers(active, '2026-10-25', QUOTA_DEFAULTS, 'new'), 3);
  assert.equal(activeUsers(active, '2026-10-25', QUOTA_DEFAULTS, 'a'), 2);
});

test('what is left never goes past the pool; staff have no limit of their own', () => {
  const pool = { total: 200, used: 195, left: 5 };
  assert.deepEqual(userQuota({ pool, active: 10, used: 2 }), {
    unlimited: false, limit: 17, used: 2, left: 5, active: 10, pool,
  });
  assert.equal(userQuota({ pool: { ...pool, used: 0, left: 200 }, active: 10, used: 17 }).left, 0);
  const staff = userQuota({ pool, active: 10, used: 50, staff: true });
  assert.equal(staff.limit, null);
  assert.equal(staff.left, 5);
});

test('saved settings override the defaults, bad ones are ignored', () => {
  const cfg = quotaConfig({ maxPerUser: '60', reserve: 2, minActive: 'x', minPerUser: -1 });
  assert.equal(cfg.maxPerUser, 60);
  assert.equal(cfg.reserve, 0.9);
  assert.equal(cfg.minActive, QUOTA_DEFAULTS.minActive);
  assert.equal(cfg.minPerUser, QUOTA_DEFAULTS.minPerUser);
});
