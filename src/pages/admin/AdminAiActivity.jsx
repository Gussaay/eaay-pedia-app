// AI activity: who used the AI on a day (or added up over the last 7 or 30
// days), for what, and how much of their own allowance and of the shared pool
// it took. Managers only; reads aiUsage/
// (lib/aiActivity.js explains the data).
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { getOne, subscribe } from '../../lib/rtdb';
import { aiActivityRange, taskLabel } from '../../lib/aiActivity';
import { AppBar, Card, Empty, Page } from '../../components/ui';

// The AI's day runs on US Pacific time, like the free tiers.
const pacificDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const shiftDay = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const time = (ms) => (ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
const fmtPct = (p) => (p === null || p === undefined ? '–' : `${p}%`);

function Bar({ pct, className = '' }) {
  const w = Math.min(100, Number(pct) || 0);
  return (
    <div className={`h-1.5 rounded-full bg-slate-100 overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${w >= 90 ? 'bg-red-500' : w >= 60 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${w}%` }} />
    </div>
  );
}

const RANGES = [
  { days: 1, label: 'Day' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
];

const STATUS = {
  ok: null,
  error: 'bg-red-50 text-red-700',
  limit: 'bg-amber-50 text-amber-800',
  cached: 'bg-violet-50 text-violet-700',
};

export default function AdminAiActivity() {
  const today = pacificDay();
  const [day, setDay] = useState(today);
  const [range, setRange] = useState(1);
  const [one, setOne] = useState({});
  const [many, setMany] = useState(null);
  const [who, setWho] = useState('');
  const [task, setTask] = useState('');

  // One day: live. A range: read once, newest day first.
  useEffect(() => {
    setWho('');
    setTask('');
    if (range === 1) {
      setOne({ day });
      const set = (k) => (v) => setOne((o) => ({ ...o, [k]: v, loaded: o.loaded || k === 'log' }));
      const offs = [
        subscribe(`aiUsage/log/${day}`, set('log')),
        subscribe(`aiUsage/users/${day}`, set('users')),
        subscribe(`aiUsage/days/${day}`, set('days')),
      ];
      return () => offs.forEach((off) => off());
    }
    let live = true;
    setMany(null);
    const list = Array.from({ length: range }, (_, i) => shiftDay(today, -i));
    Promise.all(
      list.map(async (d) => {
        const [log, users, days] = await Promise.all(
          ['log', 'users', 'days'].map((k) => getOne(`aiUsage/${k}/${d}`).catch(() => null)),
        );
        return { day: d, log, users, days };
      }),
    ).then((r) => live && setMany(r));
    return () => {
      live = false;
    };
  }, [day, range, today]);

  const loading = range === 1 ? !one.loaded : !many;
  const a = useMemo(() => aiActivityRange(range === 1 ? [one] : many || []), [range, one, many]);
  const names = useMemo(() => Object.fromEntries(a.rows.map((r) => [r.uid, r.name || r.email || r.uid.slice(0, 8)])), [a.rows]);
  const shown = a.lines.filter((l) => (!who || l.uid === who) && (!task || l.task === task));

  return (
    <>
      <AppBar title="AI activity" subtitle="Who used the AI, for what, and how much of the limit" />
      <Page className="space-y-4">
        <div className="grid grid-cols-3 gap-1 bg-slate-100 rounded-2xl p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRange(r.days)}
              className={`rounded-xl py-2 text-xs font-semibold ${range === r.days ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {range === 1 && (
          <div className="flex items-center justify-between gap-2">
            <button className="p-2 rounded-full hover:bg-slate-100" aria-label="Day before" onClick={() => setDay(shiftDay(day, -1))}>
              <ChevronLeft size={20} />
            </button>
            <p className="font-semibold text-slate-800">{day === today ? `Today (${day})` : day}</p>
            <button className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30" aria-label="Day after" disabled={day >= today} onClick={() => setDay(shiftDay(day, 1))}>
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        <Card className="p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">
              Shared pool (Groq + Gemini){range > 1 ? `, ${range} days together` : ''}
            </p>
            <p className="text-sm font-semibold text-slate-700">
              {a.poolUsed} {a.pool ? `of ${a.pool} · ${fmtPct(a.poolPct)}` : 'requests'}
            </p>
          </div>
          {a.pool > 0 && <Bar pct={a.poolPct} className="mt-2" />}
          <p className="text-xs text-slate-500 mt-2">
            {a.people} {a.people === 1 ? 'person' : 'people'} · {a.uses} uses
            {Object.keys(a.tasks).length > 0 && ' · '}
            {Object.entries(a.tasks).map(([t, n]) => `${taskLabel(t)} ${n}`).join(', ')}
          </p>
          {(a.up > 0 || a.down > 0 || a.shared > 0) && (
            <p className="text-xs text-slate-500 mt-1">
              👍 {a.up} · 👎 {a.down}
              {a.shared > 0 && ` · ${a.shared} shared explanations given free`}
            </p>
          )}
          {range > 1 && a.days.some((d) => d.used) && (
            <div className="mt-3 space-y-1">
              {a.days.map((d) => (
                <button
                  key={d.day}
                  onClick={() => {
                    setDay(d.day);
                    setRange(1);
                  }}
                  className="w-full flex items-center gap-2 text-[11px] text-slate-500"
                >
                  <span className="w-20 text-left shrink-0">{d.day.slice(5)}</span>
                  <Bar pct={d.total ? d.pct : 0} className="flex-1" />
                  <span className="w-28 text-right shrink-0">
                    {d.used}{d.total ? ` / ${d.total}` : ''} · {d.people} {d.people === 1 ? 'person' : 'people'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : !a.rows.length ? (
          <Empty icon={<Sparkles size={36} />} title={range === 1 ? 'No AI use this day' : `No AI use in the last ${range} days`} />
        ) : (
          <>
            <Card className="divide-y divide-slate-100">
              <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">People · tap to filter</p>
              {a.rows.map((r) => (
                <button
                  key={r.uid}
                  onClick={() => setWho(who === r.uid ? '' : r.uid)}
                  className={`w-full text-left px-4 py-3 ${who === r.uid ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-slate-800 truncate">{names[r.uid]}</span>
                    <span className="shrink-0 text-sm font-semibold text-slate-700">
                      {r.requests}
                      {r.staff ? ' · staff, no limit' : r.limit ? ` of ${r.limit} · ${fmtPct(r.ofLimit)}` : ''}
                      {range > 1 ? ` · ${r.daysUsed} ${r.daysUsed === 1 ? 'day' : 'days'}` : ''}
                    </span>
                  </div>
                  {!r.staff && r.limit > 0 && <Bar pct={r.ofLimit} className="mt-1.5" />}
                  <p className="text-xs text-slate-500 mt-1">
                    {fmtPct(r.ofPool)} of the pool · {Object.entries(r.tasks).map(([t, n]) => `${taskLabel(t)} ${n}`).join(', ')}
                    {r.limited > 0 && <span className="text-amber-700"> · hit the limit {r.limited}×</span>}
                    {r.errors > 0 && <span className="text-red-600"> · {r.errors} failed</span>}
                    {r.shared > 0 && ` · ${r.shared} shared`}
                    {(r.up > 0 || r.down > 0) && ` · 👍 ${r.up} 👎 ${r.down}`}
                    {r.email && r.name ? ` · ${r.email}` : ''}
                  </p>
                </button>
              ))}
            </Card>

            <div className="flex flex-wrap gap-1.5">
              {['', ...Object.keys(a.tasks)].map((t) => (
                <button
                  key={t || 'all'}
                  onClick={() => setTask(t)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${task === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {t ? taskLabel(t) : 'All'}
                </button>
              ))}
              {who && (
                <button onClick={() => setWho('')} className="rounded-full px-3 py-1 text-xs font-semibold bg-brand-50 text-brand-700">
                  {names[who]} ✕
                </button>
              )}
            </div>

            <Card className="divide-y divide-slate-100">
              {shown.map((l) => (
                <div key={l.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2 text-xs text-slate-500">
                    <span className="truncate">
                      <b className="text-slate-700">{names[l.uid] || l.email}</b> · {taskLabel(l.task)}
                      {l.count ? ` (${l.count})` : ''}
                      {l.books ? ' · textbooks' : ''}
                      {l.provider ? ` · compare ${l.provider}` : ''}
                    </span>
                    <span className="shrink-0">{range > 1 ? `${l.day.slice(5)} ` : ''}{time(l.at)}</span>
                  </div>
                  <p className="text-sm text-slate-800 mt-1 break-words">{l.what || '—'}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {l.requests || 0} request{l.requests === 1 ? '' : 's'}
                    {l.model ? ` · ${l.model}` : ''}
                    {l.ms ? ` · ${(l.ms / 1000).toFixed(1)} s` : ''}
                    {STATUS[l.status] && (
                      <span className={`ml-1.5 rounded px-1.5 py-0.5 font-semibold ${STATUS[l.status]}`}>
                        {l.status === 'limit' ? 'over limit' : l.status === 'cached' ? 'shared, free' : `failed${l.error ? `: ${l.error}` : ''}`}
                      </span>
                    )}
                    {Number(l.vote) === 1 && <span className="ml-1.5">👍</span>}
                    {Number(l.vote) === -1 && <span className="ml-1.5">👎</span>}
                    {l.fresh && <span className="ml-1.5">· asked for a new one</span>}
                  </p>
                </div>
              ))}
            </Card>
          </>
        )}
        <p className="text-[11px] text-slate-400">
          Days run on US Pacific time, like the free tiers. Over several days, a person's limit is the sum of each
          day's limit and the pool the sum of each day's pool. Tap a day to open it. Each use is logged from 25 Oct 2026; request counts before that
          appear without details.
        </p>
      </Page>
    </>
  );
}
