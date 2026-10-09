// Mnemonics home: what is due, and the mnemonic categories.
//
// Mnemonics are organised exam → paper → chapter: this page lists the exams
// (mnemonic categories, e.g. MRCPCH), the exam page shows its papers (books,
// e.g. Theory and Science), and a paper can be browsed by chapter, by basic
// science section or by source (see MnemonicPaper.jsx). Studying uses the
// flashcard engine: the same card that turns over and the same progress.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Lightbulb, Play } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync, useList } from '../hooks/useData';
import { num } from '../lib/rtdb';
import { loadAllProgress } from '../lib/flashcardData';
import { isDue } from '../lib/flashcards';
import { isMnemonicCategory, mnemonicBookSources } from '../lib/mnemonics';
import BottomNav from '../components/BottomNav';
import { AppBar, Button, Empty, ErrorBox, Page, Thumb } from '../components/ui';

function Stat({ value, label }) {
  return (
    <div className="flex-1 rounded-2xl bg-white/15 p-3 text-center backdrop-blur">
      <p className="font-display text-xl">{value}</p>
      <p className="text-[11px] text-white/80 leading-tight">{label}</p>
    </div>
  );
}

export default function Mnemonics() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const allCategories = useList('flashcategory', {
    filter: (c) => isAdmin || String(c.publish) !== 'false',
  });
  const books = useList('flashbooks');
  const decks = useList('flashdecks');
  const progress = useAsync(() => loadAllProgress(user?.uid), [user?.uid]);

  const categories = useMemo(() => allCategories.data.filter(isMnemonicCategory), [allCategories.data]);
  const mnemonicDecks = useMemo(() => {
    const sources = mnemonicBookSources(categories, books.data);
    return decks.data.filter((d) => sources.has(d.source));
  }, [categories, books.data, decks.data]);

  const dueByDeck = useMemo(() => {
    const out = {};
    mnemonicDecks.forEach((d) => {
      out[d._key] = Object.values(progress.data?.[d._key] || {}).filter((p) => isDue(p)).length;
    });
    return out;
  }, [mnemonicDecks, progress.data]);

  const totalCards = mnemonicDecks.reduce((s, d) => s + num(d.count), 0);
  const totalDue = Object.values(dueByDeck).reduce((s, n) => s + n, 0);
  const seen = mnemonicDecks.reduce((s, d) => s + Object.keys(progress.data?.[d._key] || {}).length, 0);
  const mostDue = Object.entries(dueByDeck).sort((a, b) => b[1] - a[1]).find(([, n]) => n > 0)?.[0];

  const countsFor = (categorySource) => {
    const sources = books.data.filter((b) => b.main_category === categorySource).map((b) => b.source);
    const mine = mnemonicDecks.filter((d) => sources.includes(d.source));
    return {
      books: sources.length,
      cards: mine.reduce((s, d) => s + num(d.count), 0),
      due: mine.reduce((s, d) => s + (dueByDeck[d._key] || 0), 0),
    };
  };

  return (
    <div className="min-h-screen pb-28">
      <AppBar title="Mnemonics" />
      <Page className="space-y-4">
        <section className="rounded-3xl bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-500 text-white p-5 shadow-lg shadow-teal-700/20">
          <p className="text-white/80 text-sm">
            {totalDue > 0
              ? `${totalDue} mnemonic${totalDue === 1 ? '' : 's'} due for another look`
              : 'Read the prompt, recall the hook, then turn the card for the picture.'}
          </p>
          <div className="mt-3 flex gap-2">
            <Stat value={totalCards || '—'} label="mnemonics" />
            <Stat value={seen} label="seen" />
            <Stat value={totalDue} label="due now" />
          </div>
          {mostDue && (
            <Button
              className="mt-4 w-full justify-center !bg-white !text-teal-700"
              onClick={() => navigate(`/flashcards/study/${encodeURIComponent(mostDue)}`)}
            >
              <Play size={18} /> Continue
            </Button>
          )}
        </section>

        <ErrorBox error={!allCategories.data.length && allCategories.error} onRetry={allCategories.reload} />

        <div>
          <h2 className="font-display text-slate-800 text-xl mb-3">Exams</h2>
          {allCategories.loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-slate-200/70 animate-pulse" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <Empty icon={<Lightbulb size={40} />} title="No mnemonics yet">
              {isAdmin
                ? 'In the admin panel, add a flashcard category and switch on “Mnemonics”.'
                : 'Check back soon.'}
            </Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {categories.map((c) => {
                const counts = countsFor(c.source);
                return (
                  <button
                    key={c._key}
                    onClick={() =>
                      navigate(`/mnemonics/exam/${encodeURIComponent(c.source)}?title=${encodeURIComponent(c.title || '')}`)
                    }
                    className="group text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition overflow-hidden flex"
                  >
                    <Thumb src={c.img} label={c.title} className="h-24 w-24 rounded-none text-2xl" />
                    <div className="flex-1 p-4 flex items-center gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-slate-900 leading-snug line-clamp-2">{c.title}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {counts.books} paper{counts.books === 1 ? '' : 's'} · {counts.cards} mnemonic
                          {counts.cards === 1 ? '' : 's'}
                        </p>
                        {counts.due > 0 && (
                          <span className="mt-1.5 inline-block rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-bold text-teal-700">
                            {counts.due} due
                          </span>
                        )}
                      </div>
                      <ChevronRight className="text-slate-300 group-hover:text-teal-500 shrink-0" size={20} />
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
