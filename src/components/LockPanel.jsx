// Shown on a quiz page when the quiz is locked, or opens only in part: what
// the person can do now, and a button to ask for it to be unlocked.
import { useState } from 'react';
import { Clock, Crown, Gift, KeyRound, Lock, LockOpen, Send, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useMyRequests } from '../hooks/useQuizAccess';
import { describeAccess, ROLE_INFO, SCOPE_LABELS } from '../lib/access';
import { cancelRequest, PRO_SCOPE, requestUnlock, TRIAL_SCOPE } from '../lib/unlockRequests';
import { Button, Card, useToast } from './ui';

const NOUN = { quiz: 'quiz', chapter: 'chapter', science: 'section', book: 'book', bank: 'bank' };

function Status({ request, onCancel }) {
  if (!request) return null;
  if (request.status === 'pending')
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
        <Clock size={14} /> Request sent
        <button onClick={onCancel} className="ml-1 text-slate-400 hover:text-red-600" aria-label="Cancel request">
          <X size={14} />
        </button>
      </span>
    );
  if (request.status === 'denied') return <span className="text-xs font-semibold text-red-600">Not approved</span>;
  return null;
}

/**
 * `access` and `scopes` come from useQuizAccess; `total` is the quiz's real
 * question count, `path` the page to come back to once it is unlocked.
 */
export default function LockPanel({ access, scopes, total, path }) {
  const { user, profile, access: state } = useAuth();
  const requests = useMyRequests();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const partial = access.level === 'partial';

  const ask = async (s) => {
    setBusy(s.key);
    try {
      await requestUnlock({ user, profile }, { key: s.key, type: s.type, id: s.id, title: s.title, path });
      toast('Request sent. You will be able to open it once it is approved.', 'success');
    } catch (e) {
      toast(e.message || 'Could not send the request', 'error');
    } finally {
      setBusy('');
    }
  };

  const options = [
    ...scopes.map((s) => ({ ...s, icon: LockOpen, label: `${SCOPE_LABELS[s.type] || 'Unlock'}: ${s.title}` })),
    ...(state && !state.trialUsed
      ? [{ key: TRIAL_SCOPE, type: 'trial', id: '', title: 'Free trial', icon: Gift, label: 'Free trial of every quiz' }]
      : []),
    { key: PRO_SCOPE, type: 'pro', id: '', title: 'Pro subscription', icon: Crown, label: 'Subscribe to Pro' },
  ];

  return (
    <div className={`mt-5 rounded-2xl border-2 p-4 ${partial ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}>
      <p className="flex items-center gap-2 font-semibold text-slate-900">
        <Lock size={18} className={partial ? 'text-sky-600' : 'text-slate-500'} />
        {partial ? `Preview: the first ${Math.min(access.limit, total || access.limit)} of ${total ?? '…'} questions` : 'This quiz is locked'}
      </p>
      <p className="text-sm text-slate-600 mt-1">
        {partial
          ? 'Ask for it to be unlocked to answer every question.'
          : `It has ${total ?? '…'} questions. Ask for it to be unlocked, and you can open it as soon as it is approved.`}
      </p>
      <div className="mt-3 space-y-2">
        {options.map((o, i) => {
          const Icon = o.icon;
          const req = requests[o.key];
          const pending = req?.status === 'pending';
          return (
            <div key={o.key} className="flex items-center gap-2">
              <Button
                variant={i === 0 ? 'primary' : 'outline'}
                className="flex-1 min-w-0 !justify-start text-left"
                loading={busy === o.key}
                disabled={pending}
                onClick={() => ask(o)}
              >
                {i === 0 ? <Send size={16} className="shrink-0" /> : <Icon size={16} className="shrink-0" />}
                <span className="truncate">{i === 0 ? `Request unlock: this ${NOUN[o.type] || 'quiz'}` : o.label}</span>
              </Button>
              <Status request={req} onCancel={() => cancelRequest(user.uid, o.key).catch(() => {})} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The small mark a list shows beside a quiz that does not open in full. */
export function AccessMark({ level }) {
  if (level === 'locked')
    return (
      <span className="shrink-0 text-slate-400" title="Locked: open it to request an unlock">
        <Lock size={16} />
      </span>
    );
  if (level === 'partial')
    return <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Preview</span>;
  return null;
}

/** "My access" on the profile page: role, plan, trial, and the two requests. */
export function MyAccessCard() {
  const { user, profile, role, access } = useAuth();
  const requests = useMyRequests();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  if (!access) return null;
  const pendingCount = Object.values(requests).filter((r) => r?.status === 'pending').length;

  const ask = async (key, type, title) => {
    setBusy(key);
    try {
      await requestUnlock({ user, profile }, { key, type, title, path: '/profile' });
      toast('Request sent.', 'success');
    } catch (e) {
      toast(e.message || 'Could not send the request', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 font-display text-lg text-slate-800">
        <KeyRound size={18} className="text-brand-600" /> My access
      </p>
      <p className="text-sm text-slate-700 mt-1">
        <span className="font-semibold">{ROLE_INFO[role]?.label || 'User'}</span> · {describeAccess(access)}
      </p>
      {pendingCount > 0 && (
        <p className="text-xs text-amber-700 mt-1">
          {pendingCount} unlock request{pendingCount === 1 ? '' : 's'} waiting for approval
        </p>
      )}
      {access.level !== 'full' && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {!access.trialUsed && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                loading={busy === TRIAL_SCOPE}
                disabled={requests[TRIAL_SCOPE]?.status === 'pending'}
                onClick={() => ask(TRIAL_SCOPE, 'trial', 'Free trial')}
              >
                <Gift size={16} /> Ask for a free trial
              </Button>
              <Status request={requests[TRIAL_SCOPE]} onCancel={() => cancelRequest(user.uid, TRIAL_SCOPE).catch(() => {})} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              className="flex-1"
              loading={busy === PRO_SCOPE}
              disabled={requests[PRO_SCOPE]?.status === 'pending'}
              onClick={() => ask(PRO_SCOPE, 'pro', 'Pro subscription')}
            >
              <Crown size={16} /> Subscribe to Pro
            </Button>
            <Status request={requests[PRO_SCOPE]} onCancel={() => cancelRequest(user.uid, PRO_SCOPE).catch(() => {})} />
          </div>
        </div>
      )}
    </Card>
  );
}
