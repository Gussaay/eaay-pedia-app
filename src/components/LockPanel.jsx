// Everything a locked person sees: the lock mark on lists, the "Unlock" pop-up
// (request a group, book or whole bank, a free trial, or Pro), the notice on
// a locked book or quiz page, and "My access" on the profile page.
//
// Requests go to unlock_requests (lib/unlockRequests.js) and are answered on
// the admin Users & access page.
import { useState } from 'react';
import { Check, Clock, Crown, Gift, KeyRound, Library, Lock, LockOpen, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useMyRequests } from '../hooks/useQuizAccess';
import { describeAccess, ROLE_INFO } from '../lib/access';
import { countLine } from '../lib/catalogCounts';
import { cancelRequest, PRO_SCOPE, requestUnlock, TRIAL_SCOPE } from '../lib/unlockRequests';
import { Button, Card, Modal, useToast } from './ui';

/** The small mark a list shows beside something that does not open in full. */
export function AccessMark({ level }) {
  if (level === 'locked')
    return (
      <span className="shrink-0 h-7 w-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center" title="Locked">
        <Lock size={14} />
      </span>
    );
  if (level === 'partial')
    return <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Preview</span>;
  return null;
}

/** One row of the pop-up: icon, what it is, and its button or status. */
function Option({ icon: Icon, tone = 'brand', title, desc, request, action, busy, disabled, onAsk, onCancel }) {
  const pending = request?.status === 'pending';
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3">
      <span className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${tones[tone]}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-800 leading-snug">{title}</p>
        <p className="text-xs text-slate-500 leading-snug">{desc}</p>
        {pending && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
            <Clock size={12} /> Requested, waiting for approval
            <button onClick={onCancel} className="ml-1 text-slate-400 hover:text-red-600" aria-label="Cancel request">
              <X size={12} />
            </button>
          </p>
        )}
        {request?.status === 'denied' && <p className="mt-1 text-xs font-semibold text-red-600">Not approved last time</p>}
      </div>
      {!pending && (
        <Button className="!px-3 !py-2 text-sm shrink-0" variant={disabled ? 'outline' : 'primary'} loading={busy} disabled={disabled} onClick={onAsk}>
          {action}
        </Button>
      )}
    </div>
  );
}

/**
 * The Unlock pop-up. `title` names what was tapped ("FOP"), `counts` its size,
 * `choices` the unlocks to offer (lib/access.js unlockChoices) and `path` the
 * page to come back to once approved.
 */
export function UnlockSheet({ open, onClose, title, counts, choices = [], path = '' }) {
  const { user, profile, access, accessConfig } = useAuth();
  const requests = useMyRequests();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  if (!open || !access) return null;

  const ask = async (s) => {
    setBusy(s.key);
    try {
      await requestUnlock({ user, profile }, { key: s.key, type: s.type, id: s.id || '', title: s.title, path });
      toast('Request sent. We will let you know when it is approved.', 'success');
    } catch (e) {
      toast(e.message || 'Could not send the request', 'error');
    } finally {
      setBusy('');
    }
  };
  const cancel = (key) => cancelRequest(user.uid, key).catch(() => {});
  const trialDays = accessConfig.trial_days;

  return (
    <Modal open={open} onClose={onClose} title={title ? `Unlock ${title}` : 'Unlock quizzes'}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <span className="h-10 w-10 shrink-0 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center">
            <Lock size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">{counts ? countLine(counts) : 'These quizzes are locked'}</p>
            <p className="text-xs text-slate-500">Choose how you would like to open them.</p>
          </div>
        </div>

        {choices.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Request access</p>
            {choices.map((c, i) => (
              <Option
                key={c.key}
                icon={i === 0 ? LockOpen : Library}
                title={c.type === 'bank' ? `All of ${c.title}` : c.title}
                desc={c.type === 'bank' ? 'Every book and quiz in this bank' : 'Every quiz in this part'}
                request={requests[c.key]}
                action="Request"
                busy={busy === c.key}
                onAsk={() => ask(c)}
                onCancel={() => cancel(c.key)}
              />
            ))}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Everything</p>
          {!access.trialUsed ? (
            <Option
              icon={Gift}
              tone="amber"
              title={`Free trial · ${trialDays} days`}
              desc="Every quiz in every bank, once per account"
              request={requests[TRIAL_SCOPE]}
              action="Ask"
              busy={busy === TRIAL_SCOPE}
              onAsk={() => ask({ key: TRIAL_SCOPE, type: 'trial', title: 'Free trial' })}
              onCancel={() => cancel(TRIAL_SCOPE)}
            />
          ) : (
            <p className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {access.trialActive ? 'Your free trial is running.' : 'You have used your free trial.'}
            </p>
          )}
          <Option
            icon={Crown}
            tone="violet"
            title="Pro subscription"
            desc={accessConfig.subscriptions ? 'Every quiz in every bank' : 'Coming soon'}
            request={requests[PRO_SCOPE]}
            action={accessConfig.subscriptions ? 'Subscribe' : 'Soon'}
            disabled={!accessConfig.subscriptions}
            busy={busy === PRO_SCOPE}
            onAsk={() => ask({ key: PRO_SCOPE, type: 'pro', title: 'Pro subscription' })}
            onCancel={() => cancel(PRO_SCOPE)}
          />
        </div>
      </div>
    </Modal>
  );
}

/** In place of a locked book's quiz list, or a locked quiz's start buttons. */
export function LockedNotice({ title, counts, extra, onUnlock }) {
  return (
    <Card className="p-6 text-center">
      <span className="mx-auto h-14 w-14 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center">
        <Lock size={26} />
      </span>
      <p className="font-display text-xl text-slate-900 mt-3">{title} is locked</p>
      {counts && <p className="text-sm text-slate-600 mt-1">{countLine(counts, extra)}</p>}
      <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
        Ask for access, start a free trial, or subscribe to open the quizzes.
      </p>
      <Button className="mt-4 !px-6" onClick={onUnlock}>
        <LockOpen size={18} /> Unlock
      </Button>
    </Card>
  );
}

/** "My access" on the profile page. */
export function MyAccessCard() {
  const { role, access } = useAuth();
  const requests = useMyRequests();
  const [open, setOpen] = useState(false);
  if (!access) return null;
  const pending = Object.values(requests).filter((r) => r?.status === 'pending').length;
  const full = access.level === 'full';

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span
          className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ${
            full ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {full ? <Check size={20} /> : <KeyRound size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800">{ROLE_INFO[role]?.label || 'User'}</p>
          <p className="text-sm text-slate-500 truncate">{describeAccess(access)}</p>
          {pending > 0 && (
            <p className="text-xs font-semibold text-amber-700">
              {pending} request{pending === 1 ? '' : 's'} waiting for approval
            </p>
          )}
        </div>
        {!full && (
          <Button className="!px-3 !py-2 text-sm" onClick={() => setOpen(true)}>
            <LockOpen size={16} /> Unlock
          </Button>
        )}
      </div>
      <UnlockSheet open={open} onClose={() => setOpen(false)} path="/profile" />
    </Card>
  );
}
