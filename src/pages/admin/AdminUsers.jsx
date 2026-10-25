// Users & access: one page for everything about people.
//
//   Requests   unlock, trial and Pro requests sent from the Unlock pop-up
//   People     every account, its role and access; tap one to change them
//   Settings   whether quizzes lock, what everyone else gets, trial length,
//              and whether Subscribe is open yet
//
// The list is the existing `quizusers/<uid>` record that the Android app also
// writes; this page sets `blocked` there and keeps the older `admin` flag in
// step with the role. Roles, plans, trials, Pro and unlocks live in
// access/<uid> (lib/access.js), which only the superuser and managers change.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox, Search, Settings2, Users } from 'lucide-react';
import { useAsync, useList } from '../../hooks/useData';
import { useAuth } from '../../hooks/useAuth';
import { getOne, num } from '../../lib/rtdb';
import { isAdminEmail } from '../../config';
import { ACCESS_GROUPS, PLANS, accessGroup, accessState, readConfig, roleOf } from '../../lib/access';
import { saveConfig } from '../../lib/accessAdmin';
import PersonSheet from './PersonSheet';
import { AccessPill, AppPill, RequestCard, RolePill, daysSince, emailOf, nameOf } from './accessUi';
import { APP_FILTERS, appOf } from '../../lib/appVersion';
import { AppBar, Avatar, Button, Card, Empty, ErrorBox, Input, Page, Select, SkeletonList, Toggle, useToast } from '../../components/ui';

const PAGE = 60;
const isTrue = (v) => v === true || v === 'true';

const SORTS = {
  recent: { label: 'Recently active', fn: (a, b) => daysSince(a.date) - daysSince(b.date) },
  name: { label: 'Name (A–Z)', fn: (a, b) => nameOf(a).localeCompare(nameOf(b)) },
  score: { label: 'Highest score', fn: (a, b) => num(b.over_all) - num(a.over_all) },
  played: { label: 'Most quizzes played', fn: (a, b) => num(b.total_play) - num(a.total_play) },
};

const ROLE_FILTERS = {
  '': 'All roles',
  staff: 'Staff',
  pro: 'Pro subscribers',
  user: 'Users',
};
const roleFilter = (key, role) =>
  !key || (key === 'staff' ? ['superuser', 'manager', 'editor', 'reviewer'].includes(role) : role === key);

function Kpi({ value, label, tone = 'slate', onClick, active }) {
  const tones = {
    slate: 'text-slate-900',
    amber: 'text-amber-600',
    violet: 'text-violet-700',
    emerald: 'text-emerald-700',
    red: 'text-red-600',
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:shadow-md ${
        active ? 'border-brand-400 ring-2 ring-brand-100' : 'border-slate-100'
      }`}
    >
      <p className={`font-display text-2xl leading-none ${tones[tone]}`}>{Number(value || 0).toLocaleString()}</p>
      <p className="text-[11px] text-slate-500 mt-1.5 leading-tight">{label}</p>
    </button>
  );
}

function Tabs({ tab, onChange, waiting }) {
  const tabs = [
    ['requests', 'Requests', Inbox],
    ['people', 'People', Users],
    ['settings', 'Settings', Settings2],
  ];
  return (
    <div className="flex rounded-2xl bg-slate-100 p-1">
      {tabs.map(([k, label, Icon]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition ${
            tab === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Icon size={16} />
          {label}
          {k === 'requests' && waiting > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 text-[11px] leading-5 text-white">{waiting}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function SettingsTab({ config, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => readConfig(config));
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-3">
      <Card className="p-5 space-y-3">
        <p className="font-display text-lg">Quiz locking</p>
        <Toggle label="Lock quizzes" checked={form.enabled} onChange={set('enabled')} />
        <p className="text-xs text-slate-500 -mt-2">
          Off opens every quiz to everyone. On, people see banks, groups and books with their quiz and question counts,
          and unlock them from a pop-up.
        </p>
        <Select
          label="Everyone without a role, trial or unlock gets"
          hint={PLANS[form.default_plan].desc}
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
            hint="For the Preview plan"
            type="number"
            min="1"
            value={form.partial_count}
            onChange={(e) => set('partial_count')(e.target.value)}
          />
          <Input label="Free trial (days)" type="number" min="1" value={form.trial_days} onChange={(e) => set('trial_days')(e.target.value)} />
        </div>
      </Card>
      <Card className="p-5 space-y-2">
        <p className="font-display text-lg">Subscriptions</p>
        <Toggle label="Open subscriptions" checked={form.subscriptions} onChange={set('subscriptions')} />
        <p className="text-xs text-slate-500">
          Off, the Subscribe button shows "Coming soon". On, it sends a Pro request you approve under Requests, until a
          payment system takes that over.
        </p>
      </Card>
      <Button
        className="w-full"
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
    </div>
  );
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'people';
  const group = params.get('access') || '';
  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const list = useList('quizusers');
  const accessData = useAsync(() => Promise.all([getOne('access'), getOne('access_config'), getOne('unlock_requests')]), []);
  const [accessAll, accessConfig, requestsRaw] = accessData.data || [];
  const reloadAll = () => {
    accessData.reload();
    list.reload();
  };

  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [role, setRole] = useState('');
  const [app, setApp] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [openUid, setOpenUid] = useState(null);
  const [history, setHistory] = useState(false);

  // Each person's role and access, worked out as if locking were on so the
  // groups mean the same whatever the setting.
  const users = useMemo(() => {
    const on = { ...readConfig(accessConfig), enabled: true };
    return list.data.map((u) => {
      const record = accessAll?.[u._key] || null;
      const r = roleOf({ email: emailOf(u), record, legacyAdmin: isAdminEmail(emailOf(u)) || isTrue(u.admin) });
      const state = accessState({ role: r, record, config: on });
      return { ...u, _role: r, _record: record, _access: state, _group: accessGroup(state), _app: appOf(u).kind };
    });
  }, [list.data, accessAll, accessConfig]);
  const byUid = useMemo(() => new Map(users.map((u) => [u._key, u])), [users]);

  const requests = useMemo(() => {
    const out = [];
    Object.entries(requestsRaw || {}).forEach(([uid, byKey]) =>
      Object.entries(byKey || {}).forEach(([key, r]) => out.push({ ...r, uid, key })),
    );
    return out.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  }, [requestsRaw]);
  const pending = requests.filter((r) => r.status === 'pending');

  const kpi = useMemo(() => {
    const c = { total: users.length, old: 0, pro: 0, trial: 0, subscribe: 0 };
    users.forEach((u) => {
      if (u._app === 'old') c.old += 1;
      if (u._group === 'pro') c.pro += 1;
      if (u._group === 'trial') c.trial += 1;
      if (u._group === 'subscribe') c.subscribe += 1;
    });
    return c;
  }, [users]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => roleFilter(role, u._role))
      .filter((u) => !app || u._app === app)
      .filter((u) => !group || u._group === group)
      .filter(
        (u) =>
          !needle ||
          nameOf(u).toLowerCase().includes(needle) ||
          emailOf(u).toLowerCase().includes(needle) ||
          String(u.residency || '').toLowerCase().includes(needle),
      )
      .sort(SORTS[sort].fn);
  }, [users, q, role, group, sort, app]);

  const showGroup = (g) => {
    const next = new URLSearchParams(params);
    next.set('tab', 'people');
    if (g && g !== group) next.set('access', g);
    else next.delete('access');
    setParams(next, { replace: true });
  };

  const open = openUid ? byUid.get(openUid) : null;
  const by = me?.email || me?.uid || '';
  const loading = list.loading || accessData.loading;

  return (
    <div className="min-h-screen">
      <AppBar title="Users & access" subtitle={`${kpi.total.toLocaleString()} accounts`} />
      <Page className="space-y-4">
        <ErrorBox error={list.error || accessData.error} onRetry={reloadAll} />

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Kpi value={kpi.total} label="Accounts" onClick={() => showGroup('')} active={tab === 'people' && !group} />
          <Kpi
            value={kpi.old}
            label="On the old app"
            tone={kpi.old ? 'red' : 'slate'}
            onClick={() => {
              setApp(app === 'old' ? '' : 'old');
              setParam('tab', '');
            }}
            active={app === 'old'}
          />
          <Kpi value={pending.length} label="Waiting requests" tone={pending.length ? 'amber' : 'slate'} onClick={() => setParam('tab', 'requests')} active={tab === 'requests'} />
          <Kpi value={kpi.pro} label="Pro" tone="violet" onClick={() => showGroup('pro')} active={group === 'pro'} />
          <Kpi value={kpi.trial} label="On a trial" tone="amber" onClick={() => showGroup('trial')} active={group === 'trial'} />
          <Kpi value={kpi.subscribe} label="Trial or Pro ended" tone="red" onClick={() => showGroup('subscribe')} active={group === 'subscribe'} />
        </div>

        <Tabs tab={tab} onChange={(t) => setParam('tab', t === 'people' ? '' : t)} waiting={pending.length} />

        {loading ? (
          <SkeletonList />
        ) : tab === 'requests' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{history ? 'Answered requests' : `${pending.length} waiting`}</p>
              <button className="text-sm font-semibold text-brand-700" onClick={() => setHistory((h) => !h)}>
                {history ? 'Show waiting' : 'Show answered'}
              </button>
            </div>
            {(history ? requests.filter((r) => r.status !== 'pending').slice(0, 100) : pending).length === 0 ? (
              <Empty icon={<Inbox size={36} />} title={history ? 'Nothing answered yet' : 'No requests waiting'} />
            ) : (
              (history ? requests.filter((r) => r.status !== 'pending').slice(0, 100) : pending).map((r) => (
                <RequestCard
                  key={`${r.uid}/${r.key}`}
                  r={r}
                  person={byUid.get(r.uid)}
                  config={accessConfig}
                  by={by}
                  onDone={reloadAll}
                  onOpenPerson={() => setOpenUid(r.uid)}
                />
              ))
            )}
          </div>
        ) : tab === 'settings' ? (
          <SettingsTab key={JSON.stringify(accessConfig || {})} config={accessConfig} onSaved={reloadAll} />
        ) : (
          <div className="space-y-3">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-brand-400">
              <Search size={16} className="text-slate-400" />
              <input
                className="flex-1 py-2.5 outline-none"
                placeholder="Search name, email or country"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setLimit(PAGE);
                }}
              />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Select value={app} onChange={(e) => setApp(e.target.value)}>
                {Object.entries(APP_FILTERS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {Object.entries(ROLE_FILTERS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select value={group} onChange={(e) => setParam('access', e.target.value)}>
                <option value="">All access</option>
                {Object.entries(ACCESS_GROUPS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select value={sort} onChange={(e) => setSort(e.target.value)}>
                {Object.entries(SORTS).map(([k, s]) => (
                  <option key={k} value={k}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>

            {shown.length === 0 ? (
              <Empty icon={<Users size={36} />} title="No accounts match" />
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  {shown.length.toLocaleString()} account{shown.length === 1 ? '' : 's'}
                </p>
                <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100">
                  {shown.slice(0, limit).map((u) => {
                    const days = daysSince(u.date);
                    const waiting = pending.filter((r) => r.uid === u._key).length;
                    return (
                      <button
                        key={u._key}
                        onClick={() => setOpenUid(u._key)}
                        className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50"
                      >
                        <Avatar src={u.img} size={40} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                            <span className="truncate">{nameOf(u)}</span>
                            {u._role !== 'user' && <RolePill role={u._role} />}
                            {isTrue(u.blocked) && <span className="rounded-md bg-red-50 px-1.5 text-[11px] font-semibold text-red-600">Blocked</span>}
                          </p>
                          <p className="flex items-center gap-1.5 text-xs text-slate-500">
                            <AppPill user={u} />
                            <span className="truncate">{emailOf(u) || u.level || '—'}</span>
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <AccessPill state={u._access} />
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {waiting ? (
                              <span className="font-semibold text-amber-600">{waiting} request{waiting === 1 ? '' : 's'}</span>
                            ) : days === Infinity ? (
                              'never seen'
                            ) : days === 0 ? (
                              'today'
                            ) : (
                              `${days}d ago`
                            )}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {shown.length > limit && (
                  <Button variant="outline" className="w-full" onClick={() => setLimit((n) => n + PAGE)}>
                    Show more ({(shown.length - limit).toLocaleString()} left)
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </Page>

      <PersonSheet
        person={open}
        requests={open ? pending.filter((r) => r.uid === open._key) : []}
        config={accessConfig}
        onClose={() => setOpenUid(null)}
        onChanged={reloadAll}
      />
    </div>
  );
}

