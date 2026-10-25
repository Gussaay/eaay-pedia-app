// Daily AI allowance per person, worked out from what the free tiers give.
//
// Groq and Gemini each give a fixed number of requests (and, for Groq, tokens)
// a day per model, shared by everyone. So the day's pool is the sum of every
// model's daily capacity, a part of it is kept back for staff and for the
// agent's extra steps, and the rest is split between the people who used the
// AI recently:
//
//   pool      = Σ models  min(request limit, token limit ÷ tokens per request)
//   per user  = (pool × (1 − reserve)) ÷ active users,  kept between min and max
//
// "Active" = used the AI in the last `activeDays` days, counted as at least
// `minActive` so the first few people of a day cannot take it all. The pool is
// the whole day's capacity, not what is left, so a person's limit stays the
// same all day; what is left is shown beside it, and nobody can go past the
// pool itself. Staff are not limited per person, only by the pool.
//
// Plain JavaScript with no imports, so the app's tests (node --test) run it.

export const QUOTA_DEFAULTS = {
  groqRequestsPerDay: 1000, // per model (GPT-OSS free tier)
  groqTokensPerDay: 200000, // per model; usually runs out before the requests
  geminiRequestsPerDay: 20, // per model until Google reports the real figure on a 429
  tokensPerRequest: 3000, // until today's average is known
  reserve: 0.15,
  minActive: 10,
  activeDays: 7,
  minPerUser: 3,
  maxPerUser: 40,
};

/** Settings from the aiConfig node over the defaults (bad values ignored). */
export function quotaConfig(saved) {
  const cfg = { ...QUOTA_DEFAULTS };
  for (const k of Object.keys(QUOTA_DEFAULTS)) {
    const v = Number(saved?.[k]);
    if (Number.isFinite(v) && v >= 0) cfg[k] = v;
  }
  cfg.reserve = Math.min(cfg.reserve, 0.9);
  return cfg;
}

export const modelKey = (m) => String(m).replace(/[.#$/[\]]/g, '_'); // RTDB keys cannot hold "."

/** YYYY-MM-DD `n` days before `day` (also YYYY-MM-DD). */
export function daysBefore(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Today's capacity of each model and of all of them together.
 * `today` = aiUsage/days/<today> ({ <key>: { used, tokens, resetAt } }),
 * `limits` = aiUsage/limits, `off` = aiUsage/off (models closed to the key).
 */
export function dailyPool({ groqModels = [], geminiModels = [], today = {}, limits = {}, off = {}, cfg = QUOTA_DEFAULTS, now = Date.now() }) {
  const models = [];
  const add = (model, provider) => {
    const key = modelKey(model);
    if (off?.[key]) return;
    const day = today?.[key] || {};
    const used = Number(day.used) || 0;
    const tokens = Number(day.tokens) || 0;
    const requests = Number(limits?.[key]) || (provider === 'groq' ? cfg.groqRequestsPerDay : cfg.geminiRequestsPerDay);
    let capacity = requests;
    if (provider === 'groq' && cfg.groqTokensPerDay) {
      // Today's own average once there are a few replies to go on.
      const per = used >= 5 && tokens ? tokens / used : cfg.tokensPerRequest;
      capacity = Math.min(requests, Math.floor(cfg.groqTokensPerDay / Math.max(per, 1)));
    }
    // A model the provider has closed for the day gives what it gave so far.
    if (Number(day.resetAt) > now) capacity = Math.min(capacity, used);
    capacity = Math.max(capacity, used);
    models.push({ key, provider, used, capacity });
  };
  groqModels.forEach((m) => add(m, 'groq'));
  geminiModels.forEach((m) => add(m, 'gemini'));
  const total = models.reduce((s, m) => s + m.capacity, 0);
  const used = models.reduce((s, m) => s + m.used, 0);
  return { total, used, left: Math.max(0, total - used), models };
}

/** People who used the AI in the last `activeDays` days (`active` = { uid: lastDay }). */
export function activeUsers(active, day, cfg = QUOTA_DEFAULTS, include = '') {
  const since = daysBefore(day, Math.max(1, cfg.activeDays) - 1);
  const uids = new Set(Object.entries(active || {}).filter(([, d]) => String(d) >= since).map(([u]) => u));
  if (include) uids.add(include);
  return uids.size;
}

/** One person's daily allowance. */
export function perUserLimit(poolTotal, active, cfg = QUOTA_DEFAULTS) {
  const share = Math.floor((poolTotal * (1 - cfg.reserve)) / Math.max(active, cfg.minActive, 1));
  return Math.max(cfg.minPerUser, Math.min(cfg.maxPerUser, share));
}

/**
 * What the app shows one person: their limit, use and what is left, which is
 * never more than the pool has left.
 */
export function userQuota({ pool, active, used = 0, staff = false, cfg = QUOTA_DEFAULTS }) {
  const limit = staff ? null : perUserLimit(pool.total, active, cfg);
  const own = staff ? pool.left : Math.max(0, limit - used);
  return {
    unlimited: staff,
    limit,
    used,
    left: Math.min(own, pool.left),
    active,
    pool: { total: pool.total, used: pool.used, left: pool.left },
  };
}
