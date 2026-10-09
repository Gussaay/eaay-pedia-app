// One exam paper's mnemonics (e.g. MRCPCH › Theory and Science), three ways:
//
//   Chapters       one row per clinical chapter (Cardiology, Endocrinology…)
//   Basic science  one row per section (Anatomy, Physiology, Pharmacology…),
//                  each gathering that section from every chapter
//   Sources        one row per source (TAS 2025 paper, Survival guide…)
//
// Every row opens a study set (MnemonicSet.jsx). The paper's cards are read
// once (lib/mnemonicData.js) and sliced in memory for all three views.
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookMarked, ChevronRight, FlaskConical, Layers, Lightbulb } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useData';
import { getList } from '../lib/rtdb';
import { loadAllProgress } from '../lib/flashcardData';
import { isDue } from '../lib/flashcards';
import { loadBook } from '../lib/mnemonicData';
import { SECTION_ORDER, sectionOf, setQuery, sourceOf, tallyBy } from '../lib/mnemonics';
import BottomNav from '../components/BottomNav';
import { AppBar, Empty, ErrorBox, Page, SkeletonList, Thumb } from '../components/ui';

const TABS = [
  { key: 'chapters', label: 'Chapters', icon: Layers },
  { key: 'science', label: 'Basic science', icon: FlaskConical },
  { key: 'sources', label: 'Sources', icon: BookMarked },
];

function Row({ img, icon: Icon, title, subtitle, due, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:shadow-md active:scale-[0.99]"
    >
      {img !== undefined ? (
        <Thumb src={img} label={title} className="h-12 w-12 shrink-0 text-lg" />
      ) : (
        <span className="h-12 w-12 shrink-0 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
          <Icon size={22} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-800 truncate">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{subtitle}</p>
      </div>
      {due > 0 && (
        <span className="shrink-0 rounded-full bg-teal-100 px-2.5 py-1 text-xs font-bold text-teal-700">{due} due</span>
      )}
      <ChevronRight className="text-slate-300 group-hover:text-teal-500 shrink-0" size={20} />
    </button>
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The three-way browser for one paper. Used on its own page and inline on the exam page. */
export function PaperView({ book }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('chapters');

  const data = useAsync(
    () => Promise.all([loadBook(book.source), loadAllProgress(user?.uid)]).then(([b, progress]) => ({ ...b, progress })),
    [book.source, user?.uid],
  );
  const decks = data.data?.decks || [];
  const cards = data.data?.cards || [];

  const dueOf = useMemo(() => {
    const p = data.data?.progress || {};
    return (list) => list.filter((c) => isDue(p[c.deck]?.[c._key])).length;
  }, [data.data]);

  const sections = useMemo(() => tallyBy(cards, sectionOf, SECTION_ORDER), [cards]);
  const sources = useMemo(() => tallyBy(cards, sourceOf), [cards]);
  const totalDue = dueOf(cards);

  const open = (filters) => navigate(`/mnemonics/set?${setQuery({ book: book.source, ...filters })}`);

  if (data.loading) return <SkeletonList />;
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  if (!cards.length) return <Empty icon={<Lightbulb size={40} />} title="No mnemonics in this paper yet" />;

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-500 text-white p-5 shadow-lg shadow-teal-700/20">
        <p className="text-white/80 text-sm">{book.title}</p>
        <p className="font-display text-2xl mt-1">{plural(cards.length, 'mnemonic')}</p>
        <p className="text-white/85 text-sm mt-1">
          {plural(decks.length, 'chapter')} · {plural(sections.length, 'section')} · {plural(sources.length, 'source')}
          {totalDue > 0 ? ` · ${totalDue} due` : ''}
        </p>
      </section>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition ${
              tab === key ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === 'chapters' && (
        <div className="space-y-2">
          {decks.map((d) => {
            const mine = cards.filter((c) => c.deck === d._key);
            if (!mine.length) return null;
            const parts = tallyBy(mine, sectionOf, SECTION_ORDER).map((s) => s.name);
            return (
              <Row
                key={d._key}
                img={d.img || ''}
                title={d.title}
                subtitle={`${plural(mine.length, 'mnemonic')} · ${parts.join(', ')}`}
                due={dueOf(mine)}
                onClick={() => open({ deck: d._key })}
              />
            );
          })}
        </div>
      )}

      {tab === 'science' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">Each section gathers its mnemonics from every chapter.</p>
          {sections.map((s) => {
            const mine = cards.filter((c) => sectionOf(c) === s.name);
            const chapters = new Set(mine.map((c) => c.deck)).size;
            return (
              <Row
                key={s.name}
                icon={FlaskConical}
                title={s.name === 'Clinical' ? 'Clinical (bedside)' : s.name}
                subtitle={`${plural(s.total, 'mnemonic')} across ${plural(chapters, 'chapter')}`}
                due={dueOf(mine)}
                onClick={() => open({ section: s.name })}
              />
            );
          })}
        </div>
      )}

      {tab === 'sources' && (
        <div className="space-y-2">
          {sources.map((s) => {
            const mine = cards.filter((c) => sourceOf(c) === s.name);
            const chapters = new Set(mine.map((c) => c.deck)).size;
            return (
              <Row
                key={s.name}
                icon={BookMarked}
                title={s.name}
                subtitle={`${plural(s.total, 'mnemonic')} across ${plural(chapters, 'chapter')}`}
                due={dueOf(mine)}
                onClick={() => open({ source: s.name })}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** /mnemonics/paper/:source — a paper on its own page. */
export default function MnemonicPaper() {
  const { source } = useParams();
  const [params] = useSearchParams();
  const books = useAsync(() => getList('flashbooks'), []);
  const book = (books.data || []).find((b) => b.source === source);

  return (
    <div className="min-h-screen pb-28">
      <AppBar title={book?.title || params.get('title') || 'Mnemonics'} subtitle={params.get('exam') || undefined} />
      <Page>
        {books.loading ? (
          <SkeletonList />
        ) : book ? (
          <PaperView book={book} />
        ) : (
          <Empty icon={<Lightbulb size={40} />} title="This paper is no longer available" />
        )}
      </Page>
      <BottomNav />
    </div>
  );
}
