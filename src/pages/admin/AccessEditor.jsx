// One account's role and access, inside the user manager's account dialog.
import { useState } from 'react';
import { Crown, Gift, KeyRound, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { PLANS, ROLE_INFO, SCOPE_LABELS, assignableRoles, describeAccess, readConfig } from '../../lib/access';
import { daysFromNow, endTrial, removeUnlock, setPlan, setProUntil, setRole, startTrial } from '../../lib/accessAdmin';
import { Button, Select, useToast } from '../../components/ui';

const day = (t) => (t ? new Date(Number(t)).toISOString().slice(0, 10) : '');
const fromDay = (s) => (s ? Date.parse(`${s}T23:59:59`) : null);

export default function AccessEditor({ user: u, myRole, config, onChanged }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const record = u._record || {};
  const state = u._access;
  const by = me?.email || me?.uid || '';
  const roles = assignableRoles(myRole);
  // A manager cannot change another manager; only the superuser can.
  const locked = u._role === 'manager' && myRole !== 'superuser';
  const trialDays = readConfig(config).trial_days;

  const run = async (key, fn, message) => {
    setBusy(key);
    try {
      await fn();
      toast(message, 'success');
      onChanged();
    } catch (e) {
      toast(e.message || 'Could not save', 'error');
    } finally {
      setBusy('');
    }
  };

  const unlocks = Object.entries(record.unlocks || {});

  return (
    <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
      <p className="flex items-center gap-2 font-semibold text-slate-800">
        <KeyRound size={16} className="text-brand-600" /> Role and access
      </p>
      <p className="text-sm text-slate-600">{describeAccess(state)}</p>

      <Select
        label="Role"
        hint={locked ? 'Only the superuser can change a manager.' : ROLE_INFO[u._role]?.desc}
        value={u._role}
        disabled={locked || !!busy}
        onChange={(e) => run('role', () => setRole(u._key, e.target.value, by), `Role set to ${ROLE_INFO[e.target.value].label}.`)}
      >
        {(roles.includes(u._role) ? roles : [u._role, ...roles]).map((r) => (
          <option key={r} value={r}>
            {ROLE_INFO[r].label}
          </option>
        ))}
      </Select>

      {u._role === 'pro' && (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Pro until</span>
          <span className="block text-xs text-slate-500">Leave empty for no end date.</span>
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            defaultValue={day(record.pro_until)}
            onBlur={(e) => run('pro', () => setProUntil(u._key, fromDay(e.target.value)), 'Pro end date saved.')}
          />
        </label>
      )}

      {!locked && (
        <>
          <Select
            label="Plan"
            hint="Used once any trial or Pro has ended. Staff and Pro always open everything."
            value={record.plan || ''}
            disabled={!!busy}
            onChange={(e) => run('plan', () => setPlan(u._key, e.target.value), 'Plan saved.')}
          >
            <option value="">App default ({PLANS[readConfig(config).default_plan].label})</option>
            {Object.entries(PLANS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </Select>

          <div className="flex flex-wrap items-center gap-2">
            {state.trialActive ? (
              <Button variant="outline" className="!py-2" loading={busy === 'trial'} onClick={() => run('trial', () => endTrial(u._key), 'Trial ended.')}>
                <Gift size={16} /> End trial ({day(state.trialEnd)})
              </Button>
            ) : (
              <Button
                variant="outline"
                className="!py-2"
                loading={busy === 'trial'}
                onClick={() => run('trial', () => startTrial(u._key, trialDays, by), `Trial started for ${trialDays} days.`)}
              >
                <Gift size={16} /> {state.trialUsed ? 'Give another' : 'Start a'} {trialDays}-day trial
              </Button>
            )}
            {u._role !== 'pro' && (
              <Button
                variant="outline"
                className="!py-2"
                loading={busy === 'makepro'}
                onClick={() =>
                  run(
                    'makepro',
                    async () => {
                      await setRole(u._key, 'pro', by);
                      await setProUntil(u._key, daysFromNow(30));
                    },
                    'Pro for 30 days.',
                  )
                }
              >
                <Crown size={16} /> Pro for 30 days
              </Button>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700">Unlocked</p>
            {unlocks.length === 0 ? (
              <p className="text-xs text-slate-500">Nothing yet. Approving an unlock request adds it here.</p>
            ) : (
              <ul className="mt-1 divide-y divide-slate-100">
                {unlocks.map(([key, v]) => (
                  <li key={key} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-slate-500">{SCOPE_LABELS[key.split('~')[0]] || 'Unlock'}:</span> {v?.title || key}
                      {v?.until ? <span className="text-xs text-slate-400"> · until {day(v.until)}</span> : null}
                    </span>
                    <button
                      className="text-slate-400 hover:text-red-600"
                      aria-label="Remove unlock"
                      onClick={() => run(`un:${key}`, () => removeUnlock(u._key, key), 'Unlock removed.')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
