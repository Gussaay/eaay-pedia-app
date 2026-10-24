// Who may open which quiz: roles, plans, trials and single unlocks.
//
// Two database nodes hold it, both written only by the superuser and managers
// (database.rules.json):
//
//   access/<uid>        { role, plan, plan_until, pro_until, trial: { start, end, by },
//                         unlocks: { <scope>: { at, by, title, until? } }, note }
//   access_config       { enabled, default_plan, partial_count, trial_days }
//
// and one that each person writes for themselves:
//
//   unlock_requests/<uid>/<scope>  { type, id, title, path, status, at, name, email }
//
// Everyone can still browse every bank, book and chapter with its real
// question count. What the access decides is whether a quiz opens at all
// ("locked"), opens with only its first few questions ("partial") or opens
// whole ("full").
//
// Times are milliseconds since 1970. A purchase system only has to write the
// same fields (role "pro" with pro_until, or an unlock with until), so nothing
// here changes when one is added.
//
// Plain JavaScript with no app imports, so the tests run under node.

export const SUPERUSER_EMAIL = 'gussaay@gmail.com';

export const ROLES = ['superuser', 'manager', 'editor', 'reviewer', 'pro', 'user'];

export const ROLE_INFO = {
  superuser: { label: 'Superuser', desc: 'Everything, always. Set in the code and cannot be removed.' },
  manager: { label: 'Manager', desc: 'Admin panel, users, roles, access and unlock requests.' },
  editor: { label: 'Editor', desc: 'Admin panel for content: banks, quizzes, questions, flashcards, mnemonics.' },
  reviewer: { label: 'Reviewer', desc: 'Opens every quiz in full to check the questions. No admin panel.' },
  pro: { label: 'Pro subscriber', desc: 'Every quiz in full until the subscription ends.' },
  user: { label: 'User', desc: 'The default plan, plus any trial or unlocks they were given.' },
};

/** Roles a manager may hand out. Only the superuser makes managers. */
export const assignableRoles = (byRole) =>
  byRole === 'superuser' ? ROLES.filter((r) => r !== 'superuser') : ROLES.filter((r) => r !== 'superuser' && r !== 'manager');

export const PLANS = {
  locked: { label: 'Locked', desc: 'Sees banks, books and question counts, but cannot open quizzes.' },
  partial: { label: 'Partial', desc: 'Opens every quiz, but only its first questions.' },
  full: { label: 'Full', desc: 'Opens every quiz in full.' },
};

export const DEFAULT_CONFIG = { enabled: true, default_plan: 'locked', partial_count: 10, trial_days: 7 };

const STAFF = new Set(['superuser', 'manager', 'editor', 'reviewer']);
export const isStaffRole = (role) => STAFF.has(role);
export const canAdmin = (role) => role === 'superuser' || role === 'manager' || role === 'editor';
export const canManage = (role) => role === 'superuser' || role === 'manager';

const isTrue = (v) => v === true || v === 'true';
const ms = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function readConfig(raw) {
  const c = raw || {};
  const plan = PLANS[c.default_plan] ? c.default_plan : DEFAULT_CONFIG.default_plan;
  const count = Math.max(1, Math.round(ms(c.partial_count)) || DEFAULT_CONFIG.partial_count);
  const days = Math.max(1, Math.round(ms(c.trial_days)) || DEFAULT_CONFIG.trial_days);
  return {
    enabled: c.enabled === undefined ? DEFAULT_CONFIG.enabled : isTrue(c.enabled),
    default_plan: plan,
    partial_count: count,
    trial_days: days,
  };
}

/**
 * The role someone has. The superuser is decided by email alone, so no record
 * can take it away. The older admin list and `quizusers/<uid>/admin` flag
 * count as manager until someone sets a role.
 */
export function roleOf({ email = '', record = null, legacyAdmin = false } = {}) {
  if (String(email).toLowerCase() === SUPERUSER_EMAIL) return 'superuser';
  const r = record?.role;
  if (r && ROLES.includes(r) && r !== 'superuser') return r;
  return legacyAdmin ? 'manager' : 'user';
}

/** Someone's access before looking at any particular quiz. */
export function accessState({ role = 'user', record = null, config = DEFAULT_CONFIG, now = Date.now() } = {}) {
  const cfg = readConfig(config);
  const rec = record || {};
  const trialEnd = ms(rec.trial?.end);
  const proUntil = ms(rec.pro_until);
  const planUntil = ms(rec.plan_until);
  const base = {
    role,
    limit: cfg.partial_count,
    trialEnd,
    trialUsed: !!rec.trial,
    trialActive: trialEnd > now,
    proUntil,
    unlocks: rec.unlocks || {},
    now,
  };
  if (!cfg.enabled) return { ...base, level: 'full', reason: 'off' };
  if (isStaffRole(role)) return { ...base, level: 'full', reason: 'staff' };
  if (role === 'pro' && (!proUntil || proUntil > now)) return { ...base, level: 'full', reason: 'pro' };
  if (trialEnd > now) return { ...base, level: 'full', reason: 'trial' };
  const own = PLANS[rec.plan] && (!planUntil || planUntil > now) ? rec.plan : null;
  return {
    ...base,
    level: own || cfg.default_plan,
    reason: role === 'pro' ? 'pro-ended' : own ? 'plan' : 'default',
  };
}

// Database keys cannot hold . # $ [ ] /, and chapter names sometimes do.
const encode = (s) => String(s).replace(/[%.#$[\]/]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** The key an unlock or a request is stored under. */
export const scopeKey = (type, id) => `${type}~${encode(id)}`;

export const SCOPE_LABELS = {
  quiz: 'Quiz',
  chapter: 'Chapter',
  science: 'Section',
  book: 'Whole book',
  bank: 'Whole bank',
};

const scope = (type, id, title) => (id ? { type, id: String(id), key: scopeKey(type, id), title: title || String(id) } : null);

/**
 * Every unlock that would open this quiz, narrowest first. The first one is
 * what the "Request unlock" button asks for.
 */
export function scopesOf(meta = {}, { bank = '', bookTitle = '', bankTitle = '' } = {}) {
  const b = bank || meta.bank || '';
  const book = meta.book || meta.source || '';
  const out = [];
  if (meta.kind === 'exam') out.push(scope('quiz', meta.id, meta.title));
  else if (meta.kind === 'chapter') out.push(scope('chapter', meta.pkey || `${meta.id}${meta.type || ''}`, meta.title));
  else if (meta.kind === 'set' && !meta.filter) {
    if (meta.filterChapter) out.push(scope('chapter', `${b}|${meta.filterChapter}`, meta.filterChapter));
    if (meta.science) out.push(scope('science', `${b}|${meta.science}`, meta.science));
  }
  out.push(scope('book', book, bookTitle || meta.name));
  out.push(scope('bank', b, bankTitle));
  return out.filter(Boolean);
}

/** The unlocks list for a quiz in a list, before its full record is loaded. */
export const quizScopes = ({ id, source, bank, title }) => scopesOf({ kind: 'exam', id, source, title }, { bank });

const unlockLive = (u, now) => !!u && (u === true || u === 'true' || !ms(u.until) || ms(u.until) > now);

/** What this person may do with one quiz. */
export function quizAccess(state, scopes = []) {
  if (!state) return { level: 'locked', limit: 0 };
  if (state.level === 'full') return { level: 'full', limit: Infinity, reason: state.reason };
  const hit = scopes.find((s) => unlockLive(state.unlocks?.[s.key], state.now));
  if (hit) return { level: 'full', limit: Infinity, reason: 'unlock', by: hit };
  return { level: state.level, limit: state.level === 'partial' ? state.limit : 0, reason: state.reason };
}

/** The questions someone may answer, in their quiz order. */
export function visibleQuestions(list, access) {
  if (!access || access.level === 'full') return list;
  if (access.level === 'partial') return list.slice(0, access.limit);
  return [];
}

/** A short line for the profile page and the user manager. */
export function describeAccess(state) {
  if (!state) return '';
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  switch (state.reason) {
    case 'off':
      return 'Every quiz is open (locking is switched off)';
    case 'staff':
      return `${ROLE_INFO[state.role]?.label || 'Staff'}: every quiz in full`;
    case 'pro':
      return state.proUntil ? `Pro until ${day(state.proUntil)}` : 'Pro, no end date';
    case 'trial':
      return `Free trial until ${day(state.trialEnd)}`;
    default: {
      const plan = PLANS[state.level]?.label || state.level;
      const ended = state.reason === 'pro-ended' ? 'Pro ended' : state.trialUsed && !state.trialActive ? 'Trial ended' : '';
      const unlocks = Object.keys(state.unlocks || {}).length;
      return [ended, `${plan} access`, unlocks ? `${unlocks} unlock${unlocks === 1 ? '' : 's'}` : '']
        .filter(Boolean)
        .join(' · ');
    }
  }
}

/**
 * The group a person falls into on the user manager's access filter.
 * "subscribe" is anyone whose trial or Pro ran out and who has nothing else.
 */
export function accessGroup(state) {
  if (!state) return 'locked';
  if (state.reason === 'staff' || state.reason === 'off') return 'staff';
  if (state.reason === 'pro') return 'pro';
  if (state.reason === 'trial') return 'trial';
  if (state.reason === 'pro-ended' || (state.trialUsed && !state.trialActive)) return 'subscribe';
  return state.level;
}

export const ACCESS_GROUPS = {
  staff: 'Staff (full)',
  pro: 'Pro subscribers',
  trial: 'On a trial',
  subscribe: 'Trial or Pro ended',
  full: 'Full plan',
  partial: 'Partial plan',
  locked: 'Locked',
};
