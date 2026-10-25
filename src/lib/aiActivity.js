// Who used the AI on a day, for what, and how much of the allowance: the
// admins' AI activity page (pages/admin/AdminAiActivity.jsx).
//
// The aiStudy function writes one line per use under aiUsage/log/<day>
// (functions/ai.js), counts each person's requests under
// aiUsage/users/<day>/<uid> and each model's under aiUsage/days/<day>.
// Each log line carries the person's limit and the day's pool at that time.
//
// Plain JavaScript with no app imports, so the tests run under node.

export const TASK_LABELS = {
  explain: 'Explain MCQ',
  chat: 'Tutor',
  agent: 'Agent',
  quiz: 'Quiz me',
  cards: 'Flashcards',
  mnemonic: 'Mnemonic',
};

export const taskLabel = (t) => TASK_LABELS[t] || t || 'Other';

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** The day's log as a list, newest first. */
export function logLines(log) {
  return Object.entries(log || {})
    .map(([id, l]) => ({ id, ...l }))
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
}

/**
 * Day summary and one row per person, most requests first.
 * `users` = aiUsage/users/<day> ({ uid: requests }), `days` = aiUsage/days/<day>.
 */
export function aiActivity({ log, users, days }) {
  const lines = logLines(log);
  const latest = lines[0];
  const poolUsed = Object.values(days || {}).reduce((s, m) => s + (Number(m?.used) || 0), 0);
  const pool = Number(latest?.pool) || 0;

  const people = new Map();
  const person = (uid) => {
    if (!people.has(uid)) people.set(uid, { uid, name: '', email: '', uses: 0, requests: 0, errors: 0, limited: 0, tasks: {}, last: 0, limit: null, staff: false });
    return people.get(uid);
  };
  // Oldest first, so the newest line's limit and name win.
  for (const l of [...lines].reverse()) {
    if (!l.uid) continue;
    const p = person(l.uid);
    p.name = l.name || p.name;
    p.email = l.email || p.email;
    p.uses++;
    p.tasks[l.task] = (p.tasks[l.task] || 0) + 1;
    if (l.status === 'error') p.errors++;
    if (l.status === 'limit') p.limited++;
    p.requests += Number(l.requests) || 0;
    p.last = Math.max(p.last, Number(l.at) || 0);
    if (l.staff) p.staff = true;
    else if (Number(l.limit) > 0) p.limit = Number(l.limit);
  }
  // The counter is the true count (it includes uses from before the log began).
  for (const [uid, n] of Object.entries(users || {})) person(uid).requests = Number(n) || 0;

  const rows = [...people.values()]
    .map((p) => ({
      ...p,
      ofLimit: p.staff ? null : pct(p.requests, p.limit),
      ofPool: pct(p.requests, pool),
    }))
    .sort((a, b) => b.requests - a.requests || b.last - a.last);

  const tasks = {};
  for (const l of lines) tasks[l.task] = (tasks[l.task] || 0) + 1;

  return {
    lines,
    rows,
    tasks,
    pool,
    poolUsed,
    poolPct: pct(poolUsed, pool),
    people: rows.length,
    uses: lines.length,
  };
}

/**
 * Cumulative use over several days (`list` = [{ day, log, users, days }]):
 * the same rows as `aiActivity`, with each person's requests added up and the
 * percentages taken against the allowance and pool of all those days together.
 * Everyone without a staff role had the same limit on a given day, so a
 * person's allowance over the range is the sum of each day's limit.
 * Also returns one line per day for the trend.
 */
export function aiActivityRange(list) {
  const perDay = list.map(({ day, log, users, days }) => {
    const a = aiActivity({ log, users, days });
    const dayLimit = a.lines.find((l) => !l.staff && Number(l.limit) > 0)?.limit;
    return { day, ...a, limit: Number(dayLimit) || 0 };
  });
  const allowance = perDay.reduce((s, d) => s + d.limit, 0);
  const pool = perDay.reduce((s, d) => s + d.pool, 0);
  const poolUsed = perDay.reduce((s, d) => s + d.poolUsed, 0);

  const people = new Map();
  for (const d of perDay) {
    for (const r of d.rows) {
      const p = people.get(r.uid) || { ...r, requests: 0, uses: 0, errors: 0, limited: 0, tasks: {}, daysUsed: 0 };
      p.name = r.name || p.name;
      p.email = r.email || p.email;
      p.staff = p.staff || r.staff;
      p.requests += r.requests;
      p.uses += r.uses;
      p.errors += r.errors;
      p.limited += r.limited;
      p.daysUsed++;
      p.last = Math.max(p.last || 0, r.last || 0);
      for (const [t, n] of Object.entries(r.tasks)) p.tasks[t] = (p.tasks[t] || 0) + n;
      people.set(r.uid, p);
    }
  }
  const rows = [...people.values()]
    .map((p) => ({ ...p, limit: p.staff ? null : allowance || null, ofLimit: p.staff ? null : pct(p.requests, allowance), ofPool: pct(p.requests, pool) }))
    .sort((a, b) => b.requests - a.requests || b.last - a.last);
  const tasks = {};
  for (const d of perDay) for (const [t, n] of Object.entries(d.tasks)) tasks[t] = (tasks[t] || 0) + n;

  return {
    lines: perDay.flatMap((d) => d.lines.map((l) => ({ ...l, day: d.day }))),
    rows,
    tasks,
    pool,
    poolUsed,
    poolPct: pct(poolUsed, pool),
    people: rows.length,
    uses: perDay.reduce((s, d) => s + d.uses, 0),
    days: perDay.map(({ day, poolUsed: used, pool: total, poolPct, people: n, uses }) => ({ day, used, total, pct: poolPct, people: n, uses })),
  };
}
