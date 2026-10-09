// /mnemonics/set?book=…&deck=…&section=…&source=… — the screen before studying
// any slice of a mnemonic paper: one chapter, one basic-science section across
// every chapter, one source, or a combination.
//
// The slice is named entirely by the query string, so the study screen, the
// back button and a resumed session all agree on what is being studied. The
// secondary filter here (a section within a chapter, a chapter within a
// section) just rewrites that query.
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, ChevronRight, Clock, History, LayoutGrid, Lightbulb, Play, Sparkles, Target, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useData';
import { loadAllProgress } from '../lib/flashcardData';
import { buildSession, deckSummary } from '../lib/flashcards';
import { loadBook } from '../lib/mnemonicData';
import {
  SECTION_ORDER,
  filterSet,
  flattenProgress,
  sectionOf,
  setKey,
  setQuery,
  setTitle,
  tallyBy,
} from '../lib/mnemonics';
import { clearSpot, describeSpot, loadSpot } from '../lib/resume';
import BottomNav from '../components/BottomNav';
import { AppBar, Button, Card, Empty, ErrorBox, Page, Select, SkeletonList } from '../components/ui';

const MODES = [
  { key: 'due', label: 'Due', hint: 'What has come back round' },
  { key: 'new', label: 'New', hint: 'Mnemonics you have not seen' },
  { key: 'weak', label: 'Weak', hint: 'What you keep missing' },
  { key: 'all', label: 'All', hint: 'Everything, in order' },
];
const SIZES = [10, 20, 50, 0];

function Tile({ icon: Icon, value, label, tint }) {
  return (
    <div className="flex-1 min-w-[4.5rem] rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm">
      <Icon size={18} className={`mx-auto ${tint}`} />
      <p className="font-display text-xl mt-1 text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500 leading-tight">{label}</p>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
        active ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300'
      }`}
    >
      {children}
    </button>
  );
}

export default function MnemonicSet() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const filters = {
    book: params.get('book') || '',
    deck: params.get('deck') || '',
    section: params.get('section') || '',
    source: params.get('source') || '',
  };
  const [mode, setMode] = useState('due');
  const [size, setSize] = useState(20);
  // Re-read whenever the slice changes (the filters rewrite the query string).
  const spotId = setKey(filters);
  const [forgotten, setForgotten] = useState(0);
  const spot = useMemo(() => loadSpot('mset', spotId), [spotId, forgotten]);

  const data = useAsync(
    () => Promise.all([loadBook(filters.book), loadAllProgress(user?.uid)]).then(([b, all]) => ({ ...b, all })),
    [filters.book, user?.uid],
  );
  const decks = data.data?.decks || [];
  const allCards = data.data?.cards || [];
  const progress = useMemo(
    () => flattenProgress(data.data?.all, (data.data?.decks || []).map((d) => d._key)),
    [data.data],
  );

  const cards = useMemo(() => filterSet(allCards, filters), [allCards, filters.deck, filters.section, filters.source]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = deckSummary(cards, progress);
  const queue = useMemo(() => buildSession(cards, progress, { mode, limit: size }), [cards, progress, mode, size]);

  const deckTitle = decks.find((d) => d._key === filters.deck)?.title || '';
  const title = setTitle({ deckTitle, section: filters.section, source: filters.source });

  // The other dimension to narrow by: sections when a chapter or source is
  // chosen, chapters when a section is chosen on its own.
  const sectionChoices = useMemo(
    () => tallyBy(filterSet(allCards, { deck: filters.deck, source: filters.source }), sectionOf, SECTION_ORDER),
    [allCards, filters.deck, filters.source],
  );
  const chapterChoices = useMemo(() => {
    const pool = filterSet(allCards, { section: filters.section, source: filters.source });
    return decks
      .map((d) => ({ id: d._key, title: d.title, total: pool.filter((c) => c.deck === d._key).length }))
      .filter((d) => d.total);
  }, [allCards, decks, filters.section, filters.source]);

  const refine = (patch) => navigate(`/mnemonics/set?${setQuery({ ...filters, ...patch })}`, { replace: true });
  const study = (extra) => navigate(`/mnemonics/study?${setQuery(filters)}&${new URLSearchParams(extra)}`);

  if (data.loading) {
    return (
      <div className="min-h-screen">
        <AppBar title="Mnemonics" />
        <Page>
          <SkeletonList />
        </Page>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      <AppBar title={title} subtitle={filters.deck ? 'Chapter' : filters.section ? 'Basic science' : filters.source ? 'Source' : 'Mnemonics'} />
      <Page className="space-y-4">
        <ErrorBox error={data.error} onRetry={data.reload} />

        <Card className="p-5">
          <p className="font-display text-xl text-slate-900 leading-snug">{title}</p>
          <p className="text-sm text-slate-500 mt-0.5">
            {summary.total} mnemonic{summary.total === 1 ? '' : 's'}
          </p>
          <div className="mt-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Mastered</span>
              <span className="font-semibold text-slate-700">
                {summary.mastered} of {summary.total}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-teal-500 transition-all" style={{ width: `${summary.progress}%` }} />
            </div>
          </div>
        </Card>

        <div className="flex gap-2">
          <Tile icon={Clock} value={summary.due} label="due now" tint="text-teal-600" />
          <Tile icon={Sparkles} value={summary.new} label="not seen" tint="text-sky-600" />
          <Tile icon={BookOpen} value={summary.learning} label="learning" tint="text-amber-600" />
          <Tile icon={Target} value={summary.accuracy === null ? '—' : `${summary.accuracy}%`} label="accuracy" tint="text-emerald-600" />
        </div>

        {summary.total > 0 && (
          <button
            onClick={() => navigate(`/mnemonics/gallery?${setQuery(filters)}`)}
            className="group flex w-full items-center gap-3 rounded-2xl border border-teal-100 bg-white p-4 text-left shadow-sm transition hover:shadow-md active:scale-[0.99]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <LayoutGrid size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-800">Learn first: browse the gallery</span>
              <span className="block text-sm text-slate-500">See every picture until it sticks, then test yourself below.</span>
            </span>
            <ChevronRight size={20} className="shrink-0 text-slate-300 group-hover:text-teal-500" />
          </button>
        )}

        {spot && summary.total > 0 && (
          <Card className="border-teal-200 bg-teal-50/60 p-4">
            <div className="flex items-start gap-3">
              <History size={20} className="mt-0.5 shrink-0 text-teal-600" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">You left a session unfinished</p>
                <p className="text-sm text-slate-600 mt-0.5">{describeSpot(spot)}</p>
              </div>
              <button
                onClick={() => {
                  clearSpot('mset', spotId);
                  setForgotten((n) => n + 1);
                }}
                aria-label="Forget it and start fresh"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <Button className="mt-3 w-full justify-center" onClick={() => study({ resume: '1' })}>
              <Play size={18} /> Carry on
            </Button>
          </Card>
        )}

        {allCards.length === 0 ? (
          <Empty icon={<Lightbulb size={36} />} title="No mnemonics here yet" />
        ) : (
          <Card className="p-5 space-y-5">
            {(filters.deck || filters.source) && sectionChoices.length > 1 && (
              <div>
                <p className="text-sm font-semibold text-slate-700">Section</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip active={!filters.section} onClick={() => refine({ section: '' })}>
                    All
                  </Chip>
                  {sectionChoices.map((s) => (
                    <Chip key={s.name} active={filters.section === s.name} onClick={() => refine({ section: s.name })}>
                      {s.name} ({s.total})
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {filters.section && !filters.source && chapterChoices.length > 1 && (
              <Select label="Chapter" value={filters.deck} onChange={(e) => refine({ deck: e.target.value })}>
                <option value="">All chapters</option>
                {chapterChoices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.total})
                  </option>
                ))}
              </Select>
            )}

            <div>
              <p className="text-sm font-semibold text-slate-700">Test yourself: flip cards</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {MODES.map((m) => (
                  <Chip key={m.key} active={mode === m.key} onClick={() => setMode(m.key)}>
                    {m.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-400">{MODES.find((m) => m.key === mode)?.hint}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700">How many</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SIZES.map((n) => (
                  <Chip key={n} active={size === n} onClick={() => setSize(n)}>
                    {n === 0 ? 'All' : n}
                  </Chip>
                ))}
              </div>
            </div>

            <Button
              className="w-full justify-center"
              disabled={!queue.length}
              onClick={() => study({ mode, limit: String(size) })}
            >
              <Play size={18} />
              {queue.length ? `Study ${queue.length} mnemonic${queue.length === 1 ? '' : 's'}` : 'Nothing to study'}
            </Button>
          </Card>
        )}
      </Page>
      <BottomNav />
    </div>
  );
}
