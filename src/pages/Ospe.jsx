// /ospe — OSPE picture cards, browsed the way the quizzes are (pages/Books.jsx):
//   By name    every exam or flashcard deck the pictures came from
//   Chapters   the same clinical chapters the quizzes use
//   Science    basic science (Clinical, Anatomy, Physiology...)
// or study everything that is due. A row of chips narrows everything to one
// kind of picture (skin, X-ray, ECG...), only for kinds that have cards.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileQuestion, FlaskConical, Images, Layers, Play, Search } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useData';
import { CHAPTERS, SECTIONS } from '../lib/questionBrowse';
import { OSPE_KINDS, filterOspe, groupByScience, groupBySource, groupBySystem, loadOspeCards, loadOspeProgress } from '../lib/ospeData';
import { BrowseTabs } from '../components/QuestionBrowser';
import { isDue } from '../lib/flashcards';
import BottomNav from '../components/BottomNav';
import { AppBar, Button, Empty, ErrorBox, Page, SkeletonList } from '../components/ui';

const TABS = [
  { key: 'names', label: 'By name', icon: FileQuestion },
  { key: 'chapters', label: 'Chapters', icon: Layers },
  { key: 'science', label: 'Science', icon: FlaskConical },
];
const TAB_KEY = 'ospe-tab';
const readTab = () => {
  try {
    return sessionStorage.getItem(TAB_KEY) || 'chapters';
  } catch {
    return 'chapters';
  }
};

function Row({ title, subtitle, n, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md active:scale-[0.98] transition"
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 leading-snug">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
      </div>
      <span className="text-xs font-semibold bg-sky-50 text-sky-700 rounded-full px-2 py-1">{n}</span>
      <ChevronRight className="text-slate-300 shrink-0" size={20} />
    </button>
  );
}

export default function Ospe() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [kind, setKind] = useState('');
  const [tab, setTabState] = useState(readTab);
  const [needle, setNeedle] = useState('');
  const setTab = (t) => {
    setTabState(t);
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {
      /* private mode: the tab just is not remembered */
    }
  };
  const cards = useAsync(loadOspeCards, []);
  const progress = useAsync(() => loadOspeProgress(user?.uid), [user?.uid]);

  const all = cards.data || [];
  const kinds = OSPE_KINDS.filter((k) => all.some((c) => c.kind === k.key));
  const shown = useMemo(() => filterOspe(all, { kind }), [all, kind]);
  const systems = useMemo(() => groupBySystem(shown, CHAPTERS), [shown]);
  const sources = useMemo(() => {
    const n = needle.trim().toLowerCase();
    return groupBySource(shown).filter((r) => !n || r.path.toLowerCase().includes(n));
  }, [shown, needle]);
  const sciences = useMemo(() => groupByScience(shown, SECTIONS), [shown]);
  const due = shown.filter((c) => isDue(progress.data?.[c._key])).length;
  const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();

  return (
    <div className="min-h-screen pb-28">
      <AppBar title="OSPE" subtitle={all.length ? `${all.length} picture cards` : undefined} />
      <Page className="space-y-4">
        <ErrorBox error={cards.error} onRetry={cards.reload} />
        {cards.loading ? (
          <SkeletonList />
        ) : all.length === 0 ? (
          <Empty icon={<Images size={40} />} title="No picture cards yet">
            Check back soon.
          </Empty>
        ) : (
          <>
            {kinds.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[{ key: '', label: 'All' }, ...kinds].map((k) => (
                  <button
                    key={k.key}
                    onClick={() => setKind(k.key)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                      kind === k.key ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            )}
            <Button className="w-full justify-center" onClick={() => navigate(`/ospe/study?${q({ kind })}`)}>
              <Play size={18} /> {due > 0 ? `Study all due (${due})` : 'Study all due'}
            </Button>
            <BrowseTabs tabs={TABS} tab={tab} onChange={setTab} />
            {tab === 'names' && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 focus-within:border-brand-400">
                  <Search size={16} className="text-slate-400" />
                  <input
                    value={needle}
                    onChange={(e) => setNeedle(e.target.value)}
                    placeholder="Search exams and decks"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </label>
                {sources.map((r) => (
                  <Row
                    key={r.path}
                    title={r.name}
                    subtitle={r.from}
                    n={r.n}
                    onClick={() => navigate(`/ospe/study?${q({ source: r.path, kind, mode: 'browse' })}`)}
                  />
                ))}
                {sources.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nothing matches.</p>}
              </div>
            )}
            {tab === 'chapters' && (
              <div className="space-y-2">
                {systems.map((s) => (
                  <Row
                    key={s.chapter}
                    title={s.chapter}
                    n={s.n}
                    onClick={() => navigate(`/ospe/system/${encodeURIComponent(s.chapter)}${kind ? `?${q({ kind })}` : ''}`)}
                  />
                ))}
              </div>
            )}
            {tab === 'science' && (
              <div className="space-y-2">
                {sciences.map((s) => (
                  <Row
                    key={s.science}
                    title={s.science === 'Clinical' ? 'Clinical (bedside)' : s.science}
                    n={s.n}
                    onClick={() => navigate(`/ospe/study?${q({ science: s.science, kind, mode: 'browse' })}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </Page>
      <BottomNav />
    </div>
  );
}
