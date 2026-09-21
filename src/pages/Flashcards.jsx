// Flashcards hub: your streak, what is due, and the decks grouped by system.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Flame, Layers, Search, Target, TrendingUp } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync, useList } from '../hooks/useData';
import { num } from '../lib/rtdb';
import { loadAllProgress, loadStats } from '../lib/flashcardData';
import { isDue, isMastered, isNew } from '../lib/flashcards';
import BottomNav from '../components/BottomNav';
import { AppBar, Button, Card, Empty, ErrorBox, OfflineBanner, Page, SkeletonList, Thumb } from '../components/ui';

function Stat({ icon: Icon, value, label, tint }) {
  return (
    <div className="flex-1 rounded-2xl bg-white/15 p-3 text-center backdrop-blur">
      <Icon size={18} className={`mx-auto ${tint || ''}`} />
      <p className="font-display text-xl mt-1">{value}</p>
      <p className="text-[11px] text-white/80 leading-tight">{label}</p>
    </div>
  );
}

function DeckRow({ deck, counts, onClick }) {
  const total = counts.total || num(deck.count);
  const percent = total ? Math.round((counts.mastered / total) * 100) : 0;
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:shadow-md active:scale-[0.99]"
    >
      <Thumb src={deck.img} label={deck.title} className="h-14 w-14 shrink-0 text-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-800 truncate">{deck.title}</p>
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {deck.topic ? `${deck.topic} · ` : ''}
          {total} card{total === 1 ? '' : 's'}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-violet-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        {counts.due > 0 ? (
          <span className="inline-block rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">
            {counts.due} due
          </span>
        ) : counts.new > 0 ? (
          <span className="inline-block rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
            {counts.new} new
          </span>
        ) : (
          <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {percent}%
          </span>
        )}
      </div>
    </button>
  );
}

export default function Flashcards() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState({});

  const decks = useList('flashdecks', {
    filter: (d) => isAdmin || String(d.publish) !== 'false',
    sort: (a, b) => num(a.order) - num(b.order) || String(a.title || '').localeCompare(b.title || ''),
  });
  const progress = useAsync(() => loadAllProgress(user?.uid), [user?.uid]);
  const stats = useAsync(() => loadStats(user?.uid), [user?.uid]);

  // Counts per deck, worked out from the progress already in memory — no extra
  // reads, because the whole of this user's progress came down in one go.
  const countsByDeck = useMemo(() => {
    const out = {};
    decks.data.forEach((deck) => {
      const p = progress.data?.[deck._key] || {};
      const values = Object.values(p);
      const total = num(deck.count);
      let due = 0;
      let mastered = 0;
      values.forEach((entry) => {
        if (isDue(entry)) due += 1;
        if (isMastered(entry)) mastered += 1;
      });
      out[deck._key] = {
        total,
        due,
        mastered,
        // Anything without a progress record has never been seen.
        new: Math.max(0, total - values.filter((e) => !isNew(e)).length),
      };
    });
    return out;
  }, [decks.data, progress.data]);

  const totalDue = Object.values(countsByDeck).reduce((s, c) => s + c.due, 0);

  const bySystem = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const groups = new Map();
    decks.data
      .filter(
        (d) =>
          !needle ||
          String(d.title || '').toLowerCase().includes(needle) ||
          String(d.system || '').toLowerCase().includes(needle) ||
          String(d.topic || '').toLowerCase().includes(needle),
      )
      .forEach((deck) => {
        const key = deck.system || 'Other';
        groups.set(key, [...(groups.get(key) || []), deck]);
      });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [decks.data, q]);

  const accuracy = (() => {
    const right = num(stats.data?.totalRight);
    const wrong = num(stats.data?.totalWrong);
    return right + wrong ? Math.round((right / (right + wrong)) * 100) : null;
  })();

  return (
    <div className="min-h-screen pb-28">
      <AppBar title="Flash Cards" />
      <OfflineBanner />
      <Page className="space-y-4">
        <section className="rounded-3xl bg-gradient-to-br from-violet-700 via-violet-600 to-fuchsia-500 text-white p-5 shadow-lg shadow-violet-700/20">
          <p className="text-white/80 text-sm">
            {totalDue > 0
              ? `${totalDue} card${totalDue === 1 ? '' : 's'} waiting for you`
              : 'Nothing due — start something new'}
          </p>
          <div className="mt-3 flex gap-2">
            <Stat icon={Flame} value={num(stats.data?.streak) || 0} label="day streak" tint="text-amber-300" />
            <Stat icon={Layers} value={num(stats.data?.totalSeen) || 0} label="cards seen" />
            <Stat icon={Target} value={accuracy === null ? '—' : `${accuracy}%`} label="accuracy" />
          </div>
          <Button
            variant="secondary"
            className="mt-4 w-full justify-center !bg-white !text-violet-700"
            onClick={() => navigate('/flashcards/gaps')}
          >
            <TrendingUp size={18} /> My progress and gaps
          </Button>
        </section>

        <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3">
          <Search size={16} className="text-slate-400" />
          <input
            className="flex-1 py-2.5 outline-none"
            placeholder="Search decks, systems or topics"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <ErrorBox error={!decks.data.length && decks.error} onRetry={decks.reload} />

        {decks.loading ? (
          <SkeletonList />
        ) : bySystem.length === 0 ? (
          <Empty icon={<Layers size={40} />} title={q ? 'No decks match' : 'No flashcard decks yet'}>
            {isAdmin && !q ? 'Add the first deck from the admin panel.' : null}
          </Empty>
        ) : (
          bySystem.map(([system, list]) => {
            const shut = collapsed[system];
            const dueHere = list.reduce((s, d) => s + (countsByDeck[d._key]?.due || 0), 0);
            return (
              <Card key={system} className="p-4">
                <button
                  className="flex w-full items-center gap-2 text-left"
                  onClick={() => setCollapsed((c) => ({ ...c, [system]: !shut }))}
                >
                  <h2 className="font-display text-lg text-slate-800 flex-1 truncate">{system}</h2>
                  {dueHere > 0 && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                      {dueHere} due
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{list.length}</span>
                  <ChevronDown
                    size={18}
                    className={`text-slate-400 transition-transform ${shut ? '-rotate-90' : ''}`}
                  />
                </button>
                {!shut && (
                  <div className="mt-3 space-y-2">
                    {list.map((deck) => (
                      <DeckRow
                        key={deck._key}
                        deck={deck}
                        counts={countsByDeck[deck._key] || {}}
                        onClick={() => navigate(`/flashcards/deck/${encodeURIComponent(deck._key)}`)}
                      />
                    ))}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </Page>
      <BottomNav />
    </div>
  );
}
