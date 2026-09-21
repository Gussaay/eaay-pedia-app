// Flashcards home: your streak, what is due, and the categories.
//
// Categories -> books -> decks, the same three steps as the question banks, so
// there is one way round this app rather than two.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Flame, Layers, Play, Target, TrendingUp } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync, useList } from '../hooks/useData';
import { num } from '../lib/rtdb';
import { loadAllProgress, loadStats } from '../lib/flashcardData';
import { isDue } from '../lib/flashcards';
import BottomNav from '../components/BottomNav';
import { AppBar, Button, Empty, ErrorBox, OfflineBanner, Page, Thumb } from '../components/ui';

function Stat({ icon: Icon, value, label, tint }) {
  return (
    <div className="flex-1 rounded-2xl bg-white/15 p-3 text-center backdrop-blur">
      <Icon size={18} className={`mx-auto ${tint || ''}`} />
      <p className="font-display text-xl mt-1">{value}</p>
      <p className="text-[11px] text-white/80 leading-tight">{label}</p>
    </div>
  );
}

export default function Flashcards() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const categories = useList('flashcategory', {
    filter: (c) => isAdmin || String(c.publish) !== 'false',
  });
  const books = useList('flashbooks');
  const decks = useList('flashdecks');
  const progress = useAsync(() => loadAllProgress(user?.uid), [user?.uid]);
  const stats = useAsync(() => loadStats(user?.uid), [user?.uid]);

  // Due counts come from progress already in memory — the whole of this user's
  // progress arrives in one read, so nothing extra is fetched per category.
  const dueByDeck = useMemo(() => {
    const out = {};
    Object.entries(progress.data || {}).forEach(([deckId, cards]) => {
      out[deckId] = Object.values(cards || {}).filter((p) => isDue(p)).length;
    });
    return out;
  }, [progress.data]);

  const totalDue = Object.values(dueByDeck).reduce((s, n) => s + n, 0);

  const countsFor = (categorySource) => {
    const sources = books.data
      .filter((b) => b.main_category === categorySource)
      .map((b) => b.source);
    const mine = decks.data.filter((d) => sources.includes(d.source));
    return {
      books: sources.length,
      cards: mine.reduce((s, d) => s + num(d.count), 0),
      due: mine.reduce((s, d) => s + (dueByDeck[d._key] || 0), 0),
    };
  };

  // Where "Continue studying" goes: the deck with the most cards waiting.
  const mostDue = useMemo(() => {
    const [deckId] = Object.entries(dueByDeck).sort((a, b) => b[1] - a[1])[0] || [];
    return deckId && dueByDeck[deckId] > 0 ? deckId : null;
  }, [dueByDeck]);

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

          {mostDue && (
            <Button
              className="mt-4 w-full justify-center !bg-white !text-violet-700"
              onClick={() => navigate(`/flashcards/study/${encodeURIComponent(mostDue)}`)}
            >
              <Play size={18} /> Continue studying
            </Button>
          )}
          <Button
            variant="secondary"
            className={`w-full justify-center ${mostDue ? 'mt-2 !bg-white/15 !text-white' : 'mt-4 !bg-white !text-violet-700'}`}
            onClick={() => navigate('/flashcards/gaps')}
          >
            <TrendingUp size={18} /> My progress and gaps
          </Button>
        </section>

        <ErrorBox error={!categories.data.length && categories.error} onRetry={categories.reload} />

        <div>
          <h2 className="font-display text-slate-800 text-xl mb-3">Categories</h2>
          {categories.loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-slate-200/70 animate-pulse" />
              ))}
            </div>
          ) : categories.data.length === 0 ? (
            <Empty icon={<Layers size={40} />} title="No flashcards yet">
              {isAdmin ? 'Add the first category from the admin panel.' : 'Check back soon.'}
            </Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {categories.data.map((c) => {
                const counts = countsFor(c.source);
                return (
                  <button
                    key={c._key}
                    onClick={() =>
                      navigate(
                        `/flashcards/cat/${encodeURIComponent(c.source)}?title=${encodeURIComponent(c.title || '')}`,
                      )
                    }
                    className="group text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition overflow-hidden flex"
                  >
                    <Thumb src={c.img} label={c.title} className="h-24 w-24 rounded-none text-2xl" />
                    <div className="flex-1 p-4 flex items-center gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-slate-900 leading-snug line-clamp-2">{c.title}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {counts.books} book{counts.books === 1 ? '' : 's'} · {counts.cards} card
                          {counts.cards === 1 ? '' : 's'}
                        </p>
                        {counts.due > 0 && (
                          <span className="mt-1.5 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                            {counts.due} due
                          </span>
                        )}
                      </div>
                      <ChevronRight className="text-slate-300 group-hover:text-violet-500 shrink-0" size={20} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Page>
      <BottomNav />
    </div>
  );
}
