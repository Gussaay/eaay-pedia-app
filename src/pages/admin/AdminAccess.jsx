// Access & unlock requests: the locking settings for the whole app, the
// requests people sent from a locked quiz or their profile, and how many
// people are on each kind of access. Managers and the superuser only.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Clock, Crown, Gift, Inbox, LockOpen, Settings2, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAsync } from '../../hooks/useData';
import { getOne } from '../../lib/rtdb';
import { ACCESS_GROUPS, PLANS, SCOPE_LABELS, accessGroup, accessState, readConfig, roleOf } from '../../lib/access';
import { approveRequest, denyRequest, saveConfig } from '../../lib/accessAdmin';
import { PRO_SCOPE, TRIAL_SCOPE } from '../../lib/unlockRequests';
import { isAdminEmail } from '../../config';
import { AppBar, Button, Card, Empty, ErrorBox, Input, Page, Select, SkeletonList, Toggle, useToast } from '../../components/ui';

const LENGTHS = [
  [0, 'No end'],
  [7, '7 days'],
  [30, '1 month'],
  [90, '3 months'],
  [180, '6 months'],
  [365, '1 year'],
];

const when = (t) => (t ? new Date(Number(t)).toLocaleString() : '');

function ConfigCard({ config, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => readConfig(config));
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Card className="p-5 space-y-3">
      <p className="flex items-center gap-2 font-display text-lg">
        <Settings2 size={18} className="text-brand-600" /> Locking settings
      </p>
      <Toggle label="Lock quizzes (off = every quiz open to everyone)" checked={form.enabled} onChange={set('enabled')} />
      <Select
        label="Everyone else gets"
        hint={`${PLANS[form.default_plan].desc} Applies to users without a role, plan, trial or unlock; staff and Pro always open everything.`}
        value={form.default_plan}
        onChange={(e) => set('default_plan')(e.target.value)}
      >
        {Object.entries(PLANS).map(([k, p]) => (
          <option key={k} value={k}>
            {p.label}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Preview questions"
          hint="How many a partial plan shows"
          type="number"
          min="1"
          value={form.partial_count}
          onChange={(e) => set('partial_count')(e.target.value)}
        />
        <Input
          label="Trial length (days)"
          type="number"
          min="1"
          value={form.trial_days}
          onChange={(e) => set('trial_days')(e.target.value)}
        />
      </div>
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await saveConfig(form);
            toast('Settings saved.', 'success');
            onSaved();
          } catch (e) {
            toast(e.message || 'Could not save', 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        Save settings
      </Button>
    </Card>
  );
}

function RequestRow({ r, config, by, onDone }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [days, setDays] = useState(r.key === TRIAL_SCOPE ? readConfig(config).trial_days : r.key === PRO_SCOPE ? 30 : 0);
  const [busy, setBusy] = useState('');
  const Icon = r.key === TRIAL_SCOPE ? Gift : r.key === PRO_SCOPE ? Crown : LockOpen;
  const what =
    r.key === TRIAL_SCOPE ? 'Free trial' : r.key === PRO_SCOPE ? 'Pro subscription' : `${SCOPE_LABELS[r.type] || 'Unlock'}: ${r.title || r.id}`;

  const act = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'approve') await approveRequest(r.uid, r.key, r, { days: Number(days), by, config });
      else await denyRequest(r.uid, r.key, by);
      toast(kind === 'approve' ? 'Approved.' : 'Request declined.', 'success');
      onDone();
    } catch (e) {
      toast(e.message || 'Could not save', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800 truncate">{what}</p>
          <p className="text-xs text-slate-500 truncate">
            {r.name || 'No name'} · {r.email || r.uid}
          </p>
          <p className="text-xs text-slate-400">{when(r.at)}</p>
        </div>
        {r.path && (
          <button className="text-xs font-semibold text-brand-700 shrink-0" onClick={() => navigate(r.path)}>
            Open
          </button>
        )}
      </div>
      {r.status === 'pending' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label="For how long"
          >
            {LENGTHS.filter(([d]) => r.key !== TRIAL_SCOPE || d).map(([d, label]) => (
              <option key={d} value={d}>
                {label}
              </option>
            ))}
          </select>
          <Button variant="success" className="!py-2" loading={busy === 'approve'} onClick={() => act('approve')}>
            <Check size={16} /> Approve
          </Button>
          <Button variant="outline" className="!py-2" loading={busy === 'deny'} onClick={() => act('deny')}>
            <X size={16} /> Decline
          </Button>
        </div>
      ) : (
        <p className={`mt-2 text-xs font-semibold ${r.status === 'approved' ? 'text-emerald-700' : 'text-red-600'}`}>
          {r.status === 'approved' ? 'Approved' : 'Declined'} {r.decided_at ? `· ${when(r.decided_at)}` : ''}
        </p>
      )}
    </div>
  );
}

export default function AdminAccess() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState('pending');
  const data = useAsync(
    () => Promise.all([getOne('unlock_requests'), getOne('access_config'), getOne('access'), getOne('quizusers')]),
    [],
  );
  const [requestsRaw, config, accessAll, users] = data.data || [];

  const requests = useMemo(() => {
    const out = [];
    Object.entries(requestsRaw || {}).forEach(([uid, byKey]) =>
      Object.entries(byKey || {}).forEach(([key, r]) => out.push({ ...r, uid, key })),
    );
    return out.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  }, [requestsRaw]);
  const pending = requests.filter((r) => r.status === 'pending');
  const shown = show === 'pending' ? pending : requests.filter((r) => r.status !== 'pending').slice(0, 100);

  // Grouped as if locking were on, so the numbers mean something either way.
  const groups = useMemo(() => {
    const counts = Object.fromEntries(Object.keys(ACCESS_GROUPS).map((k) => [k, 0]));
    const on = { ...readConfig(config), enabled: true };
    Object.entries(users || {}).forEach(([uid, u]) => {
      const record = accessAll?.[uid] || null;
      const email = u?.mail || u?.email || '';
      const role = roleOf({ email, record, legacyAdmin: isAdminEmail(email) || u?.admin === 'true' });
      counts[accessGroup(accessState({ role, record, config: on }))] += 1;
    });
    return counts;
  }, [users, accessAll, config]);

  return (
    <div className="min-h-screen">
      <AppBar title="Access & unlocks" subtitle={pending.length ? `${pending.length} waiting` : undefined} />
      <Page className="space-y-4">
        <ErrorBox error={data.error} onRetry={data.reload} />
        {data.loading ? (
          <SkeletonList />
        ) : (
          <>
            <div>
              <div className="flex gap-2 mb-3">
                {[
                  ['pending', `Waiting (${pending.length})`],
                  ['done', 'Answered'],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setShow(k)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                      show === k ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {shown.length === 0 ? (
                <Empty icon={show === 'pending' ? <Inbox size={36} /> : <Clock size={36} />} title={show === 'pending' ? 'No requests waiting' : 'Nothing answered yet'} />
              ) : (
                <div className="space-y-2">
                  {shown.map((r) => (
                    <RequestRow key={`${r.uid}/${r.key}`} r={r} config={config} by={user.email || user.uid} onDone={data.reload} />
                  ))}
                </div>
              )}
            </div>

            <Card className="p-5">
              <p className="font-display text-lg">Who has what</p>
              <p className="text-xs text-slate-500">Tap a group to see its people in the user manager.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(ACCESS_GROUPS).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => navigate(`/admin/users?access=${k}`)}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-left hover:border-brand-300"
                  >
                    <p className="font-display text-xl text-slate-900">{groups[k].toLocaleString()}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </button>
                ))}
              </div>
            </Card>

            <ConfigCard key={JSON.stringify(config || {})} config={config} onSaved={data.reload} />
          </>
        )}
      </Page>
    </div>
  );
}
