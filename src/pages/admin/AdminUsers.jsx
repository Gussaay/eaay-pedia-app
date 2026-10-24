// User manager: who is using the app, what they have done, and the few
// controls an admin needs over an account.
//
// The list is the existing `quizusers/<uid>` record that the Android app also
// writes. This screen sets one field there:
//
//   blocked  "true" stops the account being used
//
// and keeps the older `admin` flag in step with the role. Roles, plans, trials,
// Pro and unlocks live in access/<uid> (lib/access.js), which only the
// superuser and managers may change.
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Ban,
  BarChart3,
  CheckCircle2,
  Globe2,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { useAsync, useList } from '../../hooks/useData';
import { useAuth } from '../../hooks/useAuth';
import { getOne, num, removeAt, updateAt } from '../../lib/rtdb';
import { isAdminEmail } from '../../config';
import { ACCESS_GROUPS, ROLE_INFO, accessGroup, accessState, describeAccess, readConfig, roleOf } from '../../lib/access';
import AccessEditor from './AccessEditor';
import DangerConfirm from '../../components/DangerConfirm';
import {
  AppBar,
  Avatar,
  Button,
  Card,
  Empty,
  ErrorBox,
  Modal,
  Page,
  Select,
  SkeletonList,
  useToast,
} from '../../components/ui';

const PAGE = 60;
const isTrue = (v) => v === true || v === 'true';
const emailOf = (u) => u.mail || u.email || '';
const nameOf = (u) => u.name || emailOf(u) || u._key;

/** The records store "YYYY-MM-DD"; anything else is treated as never seen. */
function daysSince(date) {
  if (!date) return Infinity;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86_400_000);
}

const SORTS = {
  recent: { label: 'Recently active', fn: (a, b) => daysSince(a.date) - daysSince(b.date) },
  name: { label: 'Name (A–Z)', fn: (a, b) => nameOf(a).localeCompare(nameOf(b)) },
  score: { label: 'Highest score', fn: (a, b) => num(b.over_all) - num(a.over_all) },
  played: { label: 'Most quizzes played', fn: (a, b) => num(b.total_play) - num(a.total_play) },
};

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="flex-1 min-w-[7rem] rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
      <Icon size={18} className="text-brand-600" />
      <p className="font-display text-2xl mt-1 text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

export default function AdminUsers() {
  const toast = useToast();
  const navigate = useNavigate();
  const list = useList('quizusers');
  const accessData = useAsync(() => Promise.all([getOne('access'), getOne('access_config')]), []);
  const [accessAll, accessConfig] = accessData.data || [];
  const [params, setParams] = useSearchParams();
  const group = params.get('access') || '';

  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [level, setLevel] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  // Each person's role and access, worked out as if locking were on so the
  // groups mean the same whatever the setting.
  const users = useMemo(() => {
    const on = { ...readConfig(accessConfig), enabled: true };
    return list.data.map((u) => {
      const record = accessAll?.[u._key] || null;
      const role = roleOf({ email: emailOf(u), record, legacyAdmin: isAdminEmail(emailOf(u)) || isTrue(u.admin) });
      const state = accessState({ role, record, config: on });
      return { ...u, _role: role, _record: record, _access: state, _group: accessGroup(state) };
    });
  }, [list.data, accessAll, accessConfig]);

  const stats = useMemo(() => {
    const byLevel = {};
    const byCountry = {};
    let active7 = 0;
    let active30 = 0;
    users.forEach((u) => {
      const d = daysSince(u.date);
      if (d <= 7) active7 += 1;
      if (d <= 30) active30 += 1;
      if (u.level) byLevel[u.level] = (byLevel[u.level] || 0) + 1;
      if (u.residency) byCountry[u.residency] = (byCountry[u.residency] || 0) + 1;
    });
    return {
      total: users.length,
      active7,
      active30,
      byLevel,
      countries: Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [users]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => !level || u.level === level)
      .filter((u) => !group || u._group === group)
      .filter(
        (u) =>
          !needle ||
          nameOf(u).toLowerCase().includes(needle) ||
          emailOf(u).toLowerCase().includes(needle) ||
          String(u.residency || '').toLowerCase().includes(needle),
      )
      .sort(SORTS[sort].fn);
  }, [users, q, level, sort, group]);

  const patch = async (uid, values, message) => {
    setBusy(true);
    try {
      await updateAt(`quizusers/${uid}`, values);
      toast(message, 'success');
      list.reload();
      setOpen((cur) => (cur && cur._key === uid ? { ...cur, ...values } : cur));
    } catch (e) {
      toast(e.message || 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };

  const isSuperAdmin = (u) => u._role === 'superuser';
  const { role: myRole } = useAuth();
  const current = open && users.find((u) => u._key === open._key);

  return (
    <div className="min-h-screen">
      <AppBar title="User manager" subtitle={`${stats.total} accounts`} />
      <Page className="space-y-4">
        <ErrorBox error={list.error} onRetry={list.reload} />
        <ErrorBox error={accessData.error} onRetry={accessData.reload} />

        <div className="flex flex-wrap gap-3">
          <Stat icon={Users} value={stats.total} label="Total accounts" />
          <Stat icon={CheckCircle2} value={stats.active7} label="Active in 7 days" />
          <Stat icon={BarChart3} value={stats.active30} label="Active in 30 days" />
        </div>

        {stats.countries.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Globe2 size={18} className="text-slate-400" />
              <p className="font-display text-lg">Top countries</p>
            </div>
            <div className="mt-3 space-y-2">
              {stats.countries.map(([country, count]) => (
                <div key={country}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">{country}</span>
                    <span className="text-slate-500">{count}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${Math.round((count / (stats.countries[0][1] || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3">
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
          </div>
          <div className="flex gap-2">
            <Select value={sort} onChange={(e) => setSort(e.target.value)} className="flex-1">
              {Object.entries(SORTS).map(([key, s]) => (
                <option key={key} value={key}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select
              value={group}
              onChange={(e) => {
                const next = new URLSearchParams(params);
                if (e.target.value) next.set('access', e.target.value);
                else next.delete('access');
                setParams(next, { replace: true });
              }}
              className="flex-1"
            >
              <option value="">All access</option>
              {Object.entries(ACCESS_GROUPS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
            <Select value={level} onChange={(e) => setLevel(e.target.value)} className="flex-1">
              <option value="">All levels</option>
              {Object.keys(stats.byLevel).map((l) => (
                <option key={l} value={l}>
                  {l} ({stats.byLevel[l]})
                </option>
              ))}
            </Select>
          </div>
        </div>

        {list.loading ? (
          <SkeletonList />
        ) : shown.length === 0 ? (
          <Empty icon={<Users size={36} />} title="No accounts match" />
        ) : (
          <>
            <p className="text-sm text-slate-500">
              {shown.length} account{shown.length === 1 ? '' : 's'}
            </p>
            <div className="space-y-2">
              {shown.slice(0, limit).map((u) => {
                const days = daysSince(u.date);
                return (
                  <button
                    key={u._key}
                    onClick={() => setOpen(u)}
                    className="w-full text-left flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm hover:shadow-md"
                  >
                    <Avatar src={u.img} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 truncate flex items-center gap-1.5">
                        {nameOf(u)}
                        {['superuser', 'manager', 'editor'].includes(u._role) && (
                          <ShieldCheck size={14} className="shrink-0 text-brand-600" />
                        )}
                        {isTrue(u.blocked) && <Ban size={14} className="shrink-0 text-red-600" />}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {u.level || 'No level'}
                        {u.residency ? ` · ${u.residency}` : ''}
                      </p>
                      <p className="text-xs text-brand-700 truncate">
                        {ROLE_INFO[u._role]?.label} · {describeAccess(u._access)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-slate-700">{num(u.over_all)}</p>
                      <p className="text-xs text-slate-400">
                        {days === Infinity ? 'never' : days === 0 ? 'today' : `${days}d ago`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            {shown.length > limit && (
              <Button variant="outline" className="w-full justify-center" onClick={() => setLimit((n) => n + PAGE)}>
                Show more ({shown.length - limit} left)
              </Button>
            )}
          </>
        )}
      </Page>

      {/* --- One account --- */}
      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? nameOf(open) : ''}
        footer={
          <Button variant="outline" onClick={() => setOpen(null)}>
            Close
          </Button>
        }
      >
        {open && (
          <div>
            <div className="flex items-center gap-3">
              <Avatar src={open.img} size={56} />
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 truncate">{nameOf(open)}</p>
                <p className="text-sm text-slate-500 truncate">{emailOf(open) || 'No email on record'}</p>
              </div>
            </div>

            <dl className="mt-4 divide-y divide-slate-100 text-sm">
              {[
                ['Level', open.level],
                ['Country', open.residency],
                ['Overall score', num(open.over_all)],
                ['Quizzes played', num(open.total_play)],
                ['Correct answers', num(open.total_correct)],
                ['Last seen', open.date ? `${open.date}${open.time ? ` ${open.time}` : ''}` : 'never'],
                ['App version', open.ver],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 py-2">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-medium text-slate-800 text-right">{value || '—'}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 space-y-2">
              <Button
                variant="outline"
                className="w-full justify-center"
                onClick={() => {
                  setOpen(null);
                  navigate(`/admin/notifications?to=${encodeURIComponent(open._key)}`);
                }}
              >
                <Send size={16} /> Send this person a notification
              </Button>

              {current && !isSuperAdmin(current) && (
                <AccessEditor
                  user={current}
                  myRole={myRole}
                  config={accessConfig}
                  onChanged={() => {
                    accessData.reload();
                    list.reload();
                  }}
                />
              )}

              {isSuperAdmin(open) && (
                <p className="flex items-center justify-center gap-2 rounded-xl bg-brand-50 py-2.5 text-sm text-brand-700">
                  <Shield size={16} /> Superuser: always has every right (set in the app's code)
                </p>
              )}

              {!isSuperAdmin(open) && (
                <Button
                  variant={isTrue(open.blocked) ? 'outline' : 'danger'}
                  className="w-full justify-center"
                  loading={busy}
                  onClick={() =>
                    isTrue(open.blocked)
                      ? patch(open._key, { blocked: 'false' }, 'Account unblocked.')
                      : setConfirm({ user: open, kind: 'block' })
                  }
                >
                  <Ban size={16} /> {isTrue(open.blocked) ? 'Unblock account' : 'Block account'}
                </Button>
              )}

              {!isSuperAdmin(open) && (
                <Button
                  variant="danger"
                  className="w-full justify-center"
                  onClick={() => setConfirm({ user: open, kind: 'delete' })}
                >
                  <Trash2 size={16} /> Delete this account's record
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <DangerConfirm
        open={confirm?.kind === 'block'}
        title="Block this account?"
        message={`${confirm ? nameOf(confirm.user) : ''} will be signed out and cannot use the app until you unblock them.`}
        impact={['They are signed out on every device the next time the app opens.']}
        keeps={['Their scores and history are kept, and unblocking restores everything.']}
        confirmWord="BLOCK"
        confirmLabel="Block"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await patch(confirm.user._key, { blocked: 'true' }, 'Account blocked.');
          setConfirm(null);
        }}
      />

      <DangerConfirm
        open={confirm?.kind === 'delete'}
        title="Delete this account's record?"
        message={`Everything stored about ${confirm ? nameOf(confirm.user) : ''} in the user list will be removed.`}
        impact={['Their name, avatar, level, country and score totals are deleted.']}
        keeps={[
          'Their sign-in still exists, so opening the app creates a fresh empty record.',
          'To stop them using the app, block the account instead.',
        ]}
        confirmWord="DELETE"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await removeAt(`quizusers/${confirm.user._key}`);
            toast('Account record deleted.', 'success');
            list.reload();
            setOpen(null);
          } catch (e) {
            toast(e.message || 'Could not delete', 'error');
          } finally {
            setBusy(false);
            setConfirm(null);
          }
        }}
      />
    </div>
  );
}
