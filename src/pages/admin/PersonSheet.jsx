// One account on the Users & access page: who they are, their requests, role,
// access (trial, Pro, plan, unlocks) and the account actions, in one sheet.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Crown, Gift, LockOpen, Plus, Send, Shield, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useList } from '../../hooks/useData';
import { num, removeAt, updateAt } from '../../lib/rtdb';
import { PLANS, ROLE_INFO, SCOPE_LABELS, assignableRoles, describeAccess, readConfig, scopeKey } from '../../lib/access';
import {
  daysFromNow,
  endTrial,
  grantUnlock,
  removeUnlock,
  setPlan,
  setProUntil,
  setRole,
  startTrial,
} from '../../lib/accessAdmin';
import { groupBooks } from '../../lib/bookGroups';
import DangerConfirm from '../../components/DangerConfirm';
import { Avatar, Button, Modal, useToast } from '../../components/ui';
import { AccessPill, AppPill, LENGTHS, RequestCard, RolePill, emailOf, nameOf } from './accessUi';

const isTrue = (v) => v === true || v === 'true';
const day = (t) => (t ? new Date(Number(t)).toISOString().slice(0, 10) : '');
const fromDay = (s) => (s ? Date.parse(`${s}T23:59:59`) : null);

function Section({ title, children, right }) {
  return (
    <section className="border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        {right}
      </div>
      {children}
    </section>
  );
}

function Row({ icon: Icon, title, desc, children }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <span className="h-9 w-9 shrink-0 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {desc && <p className="text-xs text-slate-500">{desc}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

const smallSelect = 'rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm';

/** Every bank, group and lone book an admin can unlock directly. */
function useUnlockCatalog() {
  const banks = useList('main_category');
  const books = useList('mcqs', { filter: (b) => String(b.type) === 'quiz' });
  return useMemo(() => {
    const out = [];
    banks.data.forEach((bank) => {
      const title = bank.title || bank.source;
      out.push({ key: scopeKey('bank', bank.source), title: `All of ${title}` });
      const { groups, loose } = groupBooks(
        books.data.filter((b) => b.main_category === bank.source),
        bank,
      );
      groups.forEach((g) => out.push({ key: scopeKey('group', `${bank.source}|${g.key}`), title: `${title} · ${g.title}` }));
      loose.forEach((b) => out.push({ key: scopeKey('book', b.source), title: `${title} · ${b.title}` }));
    });
    return out;
  }, [banks.data, books.data]);
}

export default function PersonSheet({ person: u, requests = [], config, onClose, onChanged }) {
  const { user: me, role: myRole } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const catalog = useUnlockCatalog();
  const [busy, setBusy] = useState('');
  const [proDays, setProDays] = useState(30);
  const [grant, setGrant] = useState('');
  const [grantDays, setGrantDays] = useState(0);
  const [confirm, setConfirm] = useState(null);
  if (!u) return null;

  const record = u._record || {};
  const state = u._access;
  const by = me?.email || me?.uid || '';
  const superuser = u._role === 'superuser';
  // Only the superuser changes a manager.
  const frozen = superuser || (u._role === 'manager' && myRole !== 'superuser');
  const roles = assignableRoles(myRole);
  const trialDays = readConfig(config).trial_days;
  const unlocks = Object.entries(record.unlocks || {});

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

  const stats = [
    ['Level', u.level],
    ['Country', u.residency],
    ['Last seen', u.date],
    ['App', u.apk ? `${u.app || ''} (APK ${u.apk})` : u.app || (Number(u.ver) >= 6 ? 'New app' : `Old app${u.ver ? ` v${u.ver}` : ''}`)],
    ['Score', num(u.over_all)],
    ['Quizzes played', num(u.total_play)],
    ['Correct', num(u.total_correct)],
  ];

  return (
    <>
      <Modal open={!!u} onClose={onClose} title="Account" wide>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar src={u.img} size={56} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-display text-lg text-slate-900">
                <span className="truncate">{nameOf(u)}</span>
                <RolePill role={u._role} />
              </p>
              <p className="truncate text-sm text-slate-500">{emailOf(u) || 'No email on record'}</p>
              <div className="mt-1 flex items-center gap-2">
                <AccessPill state={state} />
                <AppPill user={u} long />
                {isTrue(u.blocked) && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">Blocked</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">{label}</p>
                <p className="truncate text-sm font-semibold text-slate-800">{value || '—'}</p>
              </div>
            ))}
          </div>

          {requests.length > 0 && (
            <Section title={`Waiting requests (${requests.length})`}>
              <div className="space-y-2">
                {requests.map((r) => (
                  <RequestCard key={r.key} r={r} config={config} by={by} onDone={onChanged} compact />
                ))}
              </div>
            </Section>
          )}

          <Section title="Role">
            {superuser ? (
              <p className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm text-white">
                <Shield size={16} /> Superuser: every right, always. Set in the app's code.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {(roles.includes(u._role) ? roles : [u._role, ...roles]).map((r) => (
                    <button
                      key={r}
                      disabled={frozen || !!busy}
                      onClick={() => r !== u._role && run('role', () => setRole(u._key, r, by), `Now ${ROLE_INFO[r].label}.`)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
                        r === u._role ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'
                      }`}
                    >
                      {ROLE_INFO[r].label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {frozen ? 'Only the superuser can change a manager.' : ROLE_INFO[u._role]?.desc}
                </p>
              </>
            )}
          </Section>

          {!frozen && (
            <Section title="Access" right={<span className="text-xs text-slate-500">{describeAccess(state)}</span>}>
              <div className="divide-y divide-slate-100">
                <Row
                  icon={Gift}
                  title="Free trial"
                  desc={state.trialActive ? `Running until ${day(state.trialEnd)}` : state.trialUsed ? `Ended ${day(state.trialEnd)}` : 'Not used yet'}
                >
                  {state.trialActive ? (
                    <Button variant="outline" className="!px-3 !py-1.5 text-sm" loading={busy === 'trial'} onClick={() => run('trial', () => endTrial(u._key), 'Trial ended.')}>
                      End now
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="!px-3 !py-1.5 text-sm"
                      loading={busy === 'trial'}
                      onClick={() => run('trial', () => startTrial(u._key, trialDays, by), `${trialDays}-day trial started.`)}
                    >
                      Start {trialDays} days
                    </Button>
                  )}
                </Row>

                <Row
                  icon={Crown}
                  title="Pro"
                  desc={u._role === 'pro' ? (record.pro_until ? `Until ${day(record.pro_until)}` : 'No end date') : 'Every quiz in full'}
                >
                  {u._role === 'pro' ? (
                    <>
                      <input
                        type="date"
                        className={smallSelect}
                        defaultValue={day(record.pro_until)}
                        onBlur={(e) => run('pro', () => setProUntil(u._key, fromDay(e.target.value)), 'Pro end date saved.')}
                        aria-label="Pro until"
                      />
                      <Button variant="outline" className="!px-3 !py-1.5 text-sm" loading={busy === 'unpro'} onClick={() => run('unpro', () => setRole(u._key, 'user', by), 'Pro ended.')}>
                        End
                      </Button>
                    </>
                  ) : (
                    <>
                      <select className={smallSelect} value={proDays} onChange={(e) => setProDays(Number(e.target.value))} aria-label="Pro length">
                        {LENGTHS.map(([d, label]) => (
                          <option key={d} value={d}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <Button
                        className="!px-3 !py-1.5 text-sm"
                        loading={busy === 'pro'}
                        onClick={() =>
                          run(
                            'pro',
                            async () => {
                              await setRole(u._key, 'pro', by);
                              await setProUntil(u._key, daysFromNow(proDays));
                            },
                            'Pro given.',
                          )
                        }
                      >
                        Give
                      </Button>
                    </>
                  )}
                </Row>

                <Row icon={LockOpen} title="Plan" desc="Used when no trial or Pro is running">
                  <select
                    className={smallSelect}
                    value={record.plan || ''}
                    disabled={!!busy}
                    onChange={(e) => run('plan', () => setPlan(u._key, e.target.value), 'Plan saved.')}
                    aria-label="Plan"
                  >
                    <option value="">Default ({PLANS[readConfig(config).default_plan].label})</option>
                    {Object.entries(PLANS).map(([k, p]) => (
                      <option key={k} value={k}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Row>
              </div>

              <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">Unlocked</p>
                {unlocks.length === 0 ? (
                  <p className="text-xs text-slate-500">Nothing unlocked yet.</p>
                ) : (
                  <ul className="mt-1 divide-y divide-slate-200/70">
                    {unlocks.map(([key, v]) => (
                      <li key={key} className="flex items-center gap-2 py-1.5 text-sm">
                        <span className="rounded-md bg-white px-1.5 text-[11px] font-semibold uppercase text-slate-500">
                          {SCOPE_LABELS[key.split('~')[0]] || 'Unlock'}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{v?.title || catalog.find((c) => c.key === key)?.title || key}</span>
                        <span className="shrink-0 text-xs text-slate-400">{v?.until ? `to ${day(v.until)}` : 'no end'}</span>
                        <button
                          className="text-slate-400 hover:text-red-600"
                          aria-label="Remove unlock"
                          onClick={() => run(`un:${key}`, () => removeUnlock(u._key, key), 'Unlock removed.')}
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select className={`${smallSelect} min-w-0 flex-1 bg-white`} value={grant} onChange={(e) => setGrant(e.target.value)} aria-label="Unlock">
                    <option value="">Unlock a bank, group or book…</option>
                    {catalog.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <select className={`${smallSelect} bg-white`} value={grantDays} onChange={(e) => setGrantDays(Number(e.target.value))} aria-label="For how long">
                    {LENGTHS.map(([d, label]) => (
                      <option key={d} value={d}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <Button
                    className="!px-3 !py-1.5 text-sm"
                    disabled={!grant}
                    loading={busy === 'grant'}
                    onClick={() =>
                      run(
                        'grant',
                        async () => {
                          await grantUnlock(u._key, grant, {
                            title: catalog.find((c) => c.key === grant)?.title || '',
                            until: daysFromNow(grantDays),
                            by,
                          });
                          setGrant('');
                        },
                        'Unlocked.',
                      )
                    }
                  >
                    <Plus size={15} /> Add
                  </Button>
                </div>
              </div>
            </Section>
          )}

          <Section title="Account">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="!py-2 text-sm"
                onClick={() => {
                  onClose();
                  navigate(`/admin/notifications?to=${encodeURIComponent(u._key)}`);
                }}
              >
                <Send size={15} /> Notify
              </Button>
              {!superuser && (
                <Button
                  variant="outline"
                  className={`!py-2 text-sm ${isTrue(u.blocked) ? '' : '!text-red-600'}`}
                  loading={busy === 'block'}
                  onClick={() =>
                    isTrue(u.blocked)
                      ? run('block', () => updateAt(`quizusers/${u._key}`, { blocked: 'false' }), 'Account unblocked.')
                      : setConfirm('block')
                  }
                >
                  <Ban size={15} /> {isTrue(u.blocked) ? 'Unblock' : 'Block'}
                </Button>
              )}
              {!superuser && (
                <Button variant="outline" className="!py-2 text-sm !text-red-600" onClick={() => setConfirm('delete')}>
                  <Trash2 size={15} /> Delete record
                </Button>
              )}
            </div>
          </Section>
        </div>
      </Modal>

      <DangerConfirm
        open={confirm === 'block'}
        title="Block this account?"
        message={`${nameOf(u)} will be signed out and cannot use the app until you unblock them.`}
        impact={['They are signed out on every device the next time the app opens.']}
        keeps={['Their scores and history are kept, and unblocking restores everything.']}
        confirmWord="BLOCK"
        confirmLabel="Block"
        busy={busy === 'block'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await run('block', () => updateAt(`quizusers/${u._key}`, { blocked: 'true' }), 'Account blocked.');
          setConfirm(null);
        }}
      />
      <DangerConfirm
        open={confirm === 'delete'}
        title="Delete this account's record?"
        message={`Everything stored about ${nameOf(u)} in the user list will be removed.`}
        impact={['Their name, avatar, level, country and score totals are deleted.']}
        keeps={[
          'Their sign-in still exists, so opening the app creates a fresh empty record.',
          'To stop them using the app, block the account instead.',
        ]}
        confirmWord="DELETE"
        busy={busy === 'delete'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await run('delete', () => removeAt(`quizusers/${u._key}`), 'Account record deleted.');
          setConfirm(null);
          onClose();
        }}
      />
    </>
  );
}
