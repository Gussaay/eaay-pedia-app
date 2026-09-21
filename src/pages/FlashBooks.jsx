// Books inside a flashcard category, and decks inside a book.
//
// Two small screens in one file because they are the same list with a
// different filter, exactly like the MCQ side's categories and books.
import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Layers } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync, useList } from '../hooks/useData';
import { num } from '../lib/rtdb';
import { loadAllProgress } from '../lib/flashcardData';
import { isDue, isMastered } from '../lib/flashcards';
import BottomNav from '../components/BottomNav';
import { AppBar, Empty, ErrorBox, OfflineBanner, Page, SkeletonList, Thumb } from '../components/ui';

/** Everything this person has answered, so per-deck counts need no extra read. */
function useProgress() {
  const { user } = useAuth();
  return useAsync(() => loadAllProgress(user?.uid), [user?.uid]);
}

const summarise = (cards = {}) => {
  const values = Object.values(cards);
  return {
    due: values.filter((p) => isDue(p)).length,
    mastered: values.filter(isMastered).length,
    started: values.length,
  };
};

function Row({ img, title, subtitle, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:shadow-md active:scale-[0.99]"
    >
      <Thumb src={img} label={title} className="h-14 w-14 shrink-0 text-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-800 truncate">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
      </div>
      {badge}
      <ChevronRight className="text-slate-300 group-hover:text-violet-500 shrink-0" size={20} />
    </button>
  );
}

const DueBadge = ({ count }) =>
  count > 0 ? (
    <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">
      {count} due
    </span>
  ) : null;

// ---------------------------------------------------------------------------
export function FlashCategoryBooks() {
  const { source } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const books = useList('flashbooks', {
    filter: (b) => b.main_category === source && (isAdmin || String(b.publish) !== 'false'),
  });
  const decks = useList('flashdecks');
  const progress = useProgress();

  const countsFor = (bookSource) => {
    const mine = decks.data.filter((d) => d.source === bookSource);
    return {
      decks: mine.length,
      cards: mine.reduce((s, d) => s + num(d.count), 0),
      due: mine.reduce((s, d) => s + summarise(progress.data?.[d._key]).due, 0),
    };
  };

  return (
    <div className="min-h-screen pb-28">
      <AppBar title={params.get('title') || source} subtitle="Choose a book" />
      <OfflineBanner />
      <Page className="space-y-3">
        <ErrorBox error={!books.data.length && books.error} onRetry={books.reload} />
        {books.loading ? (
          <SkeletonList />
        ) : books.data.length === 0 ? (
          <Empty icon={<Layers size={40} />} title="Nothing in this category yet" />
        ) : (
          books.data.map((b) => {
            const counts = countsFor(b.source);
            return (
              <Row
                key={b._key}
                img={b.img}
                title={b.title}
                subtitle={`${counts.decks} deck${counts.decks === 1 ? '' : 's'} · ${counts.cards} card${counts.cards === 1 ? '' : 's'}`}
                badge={<DueBadge count={counts.due} />}
                onClick={() =>
                  navigate(
                    `/flashcards/book/${encodeURIComponent(b.source)}?title=${encodeURIComponent(b.title || '')}`,
                  )
                }
              />
            );
          })
        )}
      </Page>
      <BottomNav />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function FlashBookDecks() {
  const { source } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const decks = useList('flashdecks', {
    filter: (d) => d.source === source && (isAdmin || String(d.publish) !== 'false'),
    sort: (a, b) => num(a.order) - num(b.order) || String(a.title || '').localeCompare(b.title || ''),
  });
  const progress = useProgress();

  // Decks are grouped by system here, because that is how people revise even
  // when the book they came from is organised some other way.
  const bySystem = useMemo(() => {
    const groups = new Map();
    decks.data.forEach((deck) => {
      const key = deck.system || 'Other';
      groups.set(key, [...(groups.get(key) || []), deck]);
    });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [decks.data]);

  return (
    <div className="min-h-screen pb-28">
      <AppBar title={params.get('title') || source} subtitle="Choose a deck" />
      <OfflineBanner />
      <Page className="space-y-4">
        <ErrorBox error={!decks.data.length && decks.error} onRetry={decks.reload} />
        {decks.loading ? (
          <SkeletonList />
        ) : bySystem.length === 0 ? (
          <Empty icon={<Layers size={40} />} title="No decks in this book yet" />
        ) : (
          bySystem.map(([system, list]) => (
            <div key={system}>
              <h2 className="font-display text-lg text-slate-800 mb-2">{system}</h2>
              <div className="space-y-2">
                {list.map((deck) => {
                  const total = num(deck.count);
                  const counts = summarise(progress.data?.[deck._key]);
                  const percent = total ? Math.round((counts.mastered / total) * 100) : 0;
                  return (
                    <button
                      key={deck._key}
                      onClick={() => navigate(`/flashcards/deck/${encodeURIComponent(deck._key)}`)}
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
                        ) : counts.started === 0 ? (
                          <span className="inline-block rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                            new
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            {percent}%
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </Page>
      <BottomNav />
    </div>
  );
}
