// Small pieces shared by the Users & access page and its account sheet.
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { ROLE_INFO, SCOPE_LABELS, readConfig } from '../../lib/access';
import { approveRequest, denyRequest } from '../../lib/accessAdmin';
import { PRO_SCOPE, TRIAL_SCOPE } from '../../lib/unlockRequests';
import { appOf } from '../../lib/appVersion';
import { Avatar, Button, useToast } from '../../components/ui';

export const emailOf = (u) => u.mail || u.email || '';
export const nameOf = (u) => u.name || emailOf(u) || u._key || '';

/** The records store "YYYY-MM-DD"; anything else is treated as never seen. */
export function daysSince(date) {
  if (!date) return Infinity;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86_400_000);
}

const ROLE_TONES = {
  superuser: 'bg-slate-900 text-white',
  manager: 'bg-brand-600 text-white',
  editor: 'bg-sky-100 text-sky-800',
  reviewer: 'bg-teal-100 text-teal-800',
  pro: 'bg-violet-100 text-violet-800',
  user: 'bg-slate-100 text-slate-600',
};

export function RolePill({ role }) {
  return (
    <span className={`shrink-0 rounded-md px-1.5 text-[11px] font-semibold leading-5 ${ROLE_TONES[role] || ROLE_TONES.user}`}>
      {ROLE_INFO[role]?.label || role}
    </span>
  );
}

const APP_TONES = {
  old: 'bg-red-50 text-red-700',
  new: 'bg-slate-100 text-slate-600',
  android: 'bg-emerald-50 text-emerald-700',
  web: 'bg-sky-50 text-sky-700',
};

/** Which app this person last opened: old app, or the new one and its build. */
export function AppPill({ user, long = false }) {
  const a = appOf(user);
  return (
    <span className={`inline-block rounded-md px-1.5 text-[11px] font-semibold leading-5 ${APP_TONES[a.kind]}`} title={a.label}>
      {long ? a.label : a.short}
    </span>
  );
}

const day = (t) => new Date(Number(t)).toISOString().slice(5, 10);

/** Full, Trial until…, Pro until…, Preview or Locked, as a coloured pill. */
export function AccessPill({ state }) {
  if (!state) return null;
  const [text, tone] =
    state.reason === 'staff'
      ? ['Full', 'bg-emerald-50 text-emerald-700']
      : state.reason === 'pro'
      ? [state.proUntil ? `Pro to ${day(state.proUntil)}` : 'Pro', 'bg-violet-50 text-violet-700']
      : state.reason === 'trial'
      ? [`Trial to ${day(state.trialEnd)}`, 'bg-amber-50 text-amber-700']
      : state.level === 'full'
      ? ['Full', 'bg-emerald-50 text-emerald-700']
      : state.level === 'partial'
      ? ['Preview', 'bg-sky-50 text-sky-700']
      : Object.keys(state.unlocks || {}).length
      ? [`${Object.keys(state.unlocks).length} unlocked`, 'bg-brand-50 text-brand-700']
      : ['Locked', 'bg-slate-100 text-slate-500'];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{text}</span>;
}

export const LENGTHS = [
  [0, 'No end'],
  [7, '7 days'],
  [30, '1 month'],
  [90, '3 months'],
  [180, '6 months'],
  [365, '1 year'],
];

export function ago(t) {
  if (!t) return '';
  const m = Math.round((Date.now() - Number(t)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : new Date(Number(t)).toISOString().slice(0, 10);
}

export function requestWhat(r) {
  if (r.key === TRIAL_SCOPE) return { label: 'Free trial', kind: 'Trial' };
  if (r.key === PRO_SCOPE) return { label: 'Pro subscription', kind: 'Pro' };
  return { label: r.title || r.id, kind: SCOPE_LABELS[r.type] || 'Unlock' };
}

export function RequestCard({ r, person, config, by, onDone, onOpenPerson, compact }) {
  const toast = useToast();
  const [days, setDays] = useState(r.key === TRIAL_SCOPE ? readConfig(config).trial_days : r.key === PRO_SCOPE ? 30 : 0);
  const [busy, setBusy] = useState('');
  const what = requestWhat(r);

  const act = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'approve') await approveRequest(r.uid, r.key, r, { days: Number(days), by, config });
      else await denyRequest(r.uid, r.key, by);
      toast(kind === 'approve' ? `Approved: ${what.label}` : 'Request declined.', 'success');
      onDone();
    } catch (e) {
      toast(e.message || 'Could not save', 'error');
    } finally {
      setBusy('');
    }
  };

  const lengths = r.key === TRIAL_SCOPE ? LENGTHS.filter(([d]) => d) : LENGTHS;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        {!compact && (
          <button onClick={onOpenPerson} className="shrink-0" aria-label="Open account">
            <Avatar src={person?.img} size={40} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {!compact && (
            <button onClick={onOpenPerson} className="block max-w-full truncate text-left text-sm font-semibold text-slate-800 hover:text-brand-700">
              {r.name || nameOf(person || {}) || 'No name'}
              <span className="font-normal text-slate-400"> · {r.email || emailOf(person || {}) || r.uid}</span>
            </button>
          )}
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
              {what.kind}
            </span>
            <span className="truncate font-medium">{what.label}</span>
          </p>
        </div>
        <span className="shrink-0 text-xs text-slate-400">{ago(r.at)}</span>
      </div>
      {r.status === 'pending' ? (
        <div className="mt-3 flex items-center gap-2">
          <select
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label="For how long"
          >
            {lengths.map(([d, label]) => (
              <option key={d} value={d}>
                {label}
              </option>
            ))}
          </select>
          <Button variant="success" className="!px-3 !py-2 text-sm" loading={busy === 'approve'} onClick={() => act('approve')}>
            <Check size={16} /> Approve
          </Button>
          <Button variant="outline" className="!px-3 !py-2 text-sm" loading={busy === 'deny'} onClick={() => act('deny')} aria-label="Decline">
            <X size={16} />
          </Button>
        </div>
      ) : (
        <p className={`mt-2 text-xs font-semibold ${r.status === 'approved' ? 'text-emerald-700' : 'text-red-600'}`}>
          {r.status === 'approved' ? 'Approved' : 'Declined'}
          {r.decided_at ? ` ${ago(r.decided_at)}` : ''}
          {r.decided_by ? ` by ${r.decided_by}` : ''}
        </p>
      )}
    </div>
  );
}

