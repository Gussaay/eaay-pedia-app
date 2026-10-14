// Browsing a question bank (or one book) the way mnemonics are browsed:
//
//   Chapters        one row per clinical chapter, with its basic-science sections
//   Basic science   one row per section, gathering it from every chapter
//
// Every row and chip opens a "set" quiz (lib/quizSource.js, kind "set") made of
// those questions. Counts come from qbrowse/<bank> (written by
// .tmp/link/browse.mjs), so the lists open without reading every question.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FlaskConical, Layers } from 'lucide-react';
import { useAsync } from '../hooks/useData';
import { getOne } from '../lib/rtdb';
import { loadBookQuestions, quizPath } from '../lib/quizSource';
import { loadAllHistory } from '../lib/quizHistory';
import { useAuth } from '../hooks/useAuth';
import {
  ANSWER_FILTERS,
  BATCH,
  CHAPTERS,
  LINK_FILTERS,
  SECTIONS,
  batchCount,
  batchRange,
  makeFilter,
  practiceCounts,
  setId,
} from '../lib/questionBrowse';
import { Empty, ErrorBox, SkeletonList } from './ui';

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const sectionLabel = (s) => (s === 'Clinical' ? 'Clinical (bedside)' : s);
const byCount = (obj = {}) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

/** The tab strip used by the MCQ browse screens (same look as the mnemonic paper). */
export function BrowseTabs({ tabs, tab, onChange }) {
  return (
    <div className={`grid gap-1 rounded-2xl bg-slate-100 p-1`} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} role="tablist">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          role="tab"
          aria-selected={tab === key}
          onClick={() => onChange(key)}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs sm:text-sm font-semibold transition ${
            tab === key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {Icon && <Icon size={16} className="shrink-0" />} <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}

function Row({ icon: Icon, title, subtitle, onOpen, chips = [], onChip }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md">
      <button onClick={onOpen} className="group w-full text-left flex items-center gap-3 p-3 active:scale-[0.99]">
        <span className="h-11 w-11 shrink-0 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800 truncate">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{subtitle}</p>
        </div>
        <ChevronRight className="text-slate-300 group-hover:text-brand-500 shrink-0" size={20} />
      </button>
      {chips.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-3 -mt-1">
          {chips.map(([name, n]) => (
            <button
              key={name}
              onClick={() => onChip(name)}
              className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:border-brand-300 hover:text-brand-700"
            >
              {sectionLabel(name)} <span className="text-slate-400">{n}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Chapters or basic-science rows for a bank, optionally limited to one book.
 * `mode` is "chapters" or "science".
 */
export default function QuestionBrowser({ bank, book = '', bookTitle = '', name = '', mode = 'chapters' }) {
  const navigate = useNavigate();
  const data = useAsync(() => getOne(`qbrowse/${bank}`), [bank]);
  const stats = useMemo(() => {
    const all = data.data || null;
    if (!all) return null;
    return book ? all.books?.[book] || null : all;
  }, [data.data, book]);

  const open = ({ chapter = '', science = '' }) => {
    const filters = { bank, book, chapter, science };
    navigate(quizPath('set', setId(filters), { ...filters, bookTitle, name }));
  };

  if (data.loading) return <SkeletonList />;
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  return <BrowseLists stats={stats} mode={mode} onOpen={open} />;
}

/**
 * Practice sets for one book, from two filters that combine: which questions
 * (all, repeated, not repeated) and your answers (all, not answered yet,
 * answered correctly, answered wrongly). Each repeated question is counted
 * once; sets over 100 questions open in parts of 100.
 */
export function PracticeSets({ bank, book, bookTitle = '', name = '' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [link, setLink] = useState('');
  const [answer, setAnswer] = useState('');
  const data = useAsync(
    () => Promise.all([loadBookQuestions(book), loadAllHistory(user?.uid)]).then(([list, history]) => practiceCounts(list, history)),
    [book, user?.uid],
  );
  const counts = data.data;
  const n = counts ? counts[link][answer] : 0;
  const withCopies = counts ? counts.copies[link] : 0;
  const filter = makeFilter({ link, answer });
  const open = (part = 0) => {
    const f = { bank, book, filter, part };
    navigate(quizPath('set', setId(f), { ...f, part: part || '', bookTitle, name }));
  };

  const Chips = ({ items, value, onChange, count }) => (
    <div className="flex flex-wrap gap-2">
      {items.map((f) => (
        <button
          key={f.key || 'all'}
          onClick={() => onChange(f.key)}
          title={f.hint || ''}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
            value === f.key ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'
          }`}
        >
          {f.label}
          {counts ? <span className="ml-1 text-xs text-slate-400">{count(f.key).toLocaleString()}</span> : null}
        </button>
      ))}
    </div>
  );

  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Choose which questions and which of your answers to practise. A question asked in several sittings counts once.
      </p>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Questions</p>
        <Chips items={LINK_FILTERS} value={link} onChange={setLink} count={(k) => counts[k][answer]} />
        {LINK_FILTERS.find((f) => f.key === link)?.hint && (
          <p className="text-xs text-slate-500">{LINK_FILTERS.find((f) => f.key === link).hint}</p>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your answers</p>
        <Chips items={ANSWER_FILTERS} value={answer} onChange={setAnswer} count={(k) => counts[link][k]} />
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        {data.loading ? (
          <p className="text-sm text-slate-500">Counting questions…</p>
        ) : (
          <>
            <p className="font-semibold text-slate-800">{plural(n, 'question')}</p>
            {!answer && withCopies > n && (
              <p className="text-xs text-slate-500 mt-0.5">
                {withCopies.toLocaleString()} including repeats in other sittings — each counted once here
              </p>
            )}
            {n === 0 ? (
              <p className="text-sm text-slate-500 mt-2">No questions match these filters.</p>
            ) : n <= BATCH ? (
              <button
                onClick={() => open(0)}
                className="mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Open these questions
              </button>
            ) : (
              <BatchButtons total={n} onOpen={open} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** "Part 1 (1–100)", "Part 2 (101–200)"… for a set too long for one sitting. */
export function BatchButtons({ total, onOpen }) {
  return (
    <div className="mt-3">
      <p className="text-xs text-slate-500 mb-2">Answer them in parts of {BATCH}:</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: batchCount(total) }, (_, i) => i + 1).map((part) => (
          <button
            key={part}
            onClick={() => onOpen(part)}
            className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-left text-sm hover:bg-brand-100"
          >
            <span className="block font-semibold text-brand-800">Part {part}</span>
            <span className="block text-xs text-slate-500">Questions {batchRange(part, total)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The rows themselves, from a qbrowse counts record. */
export function BrowseLists({ stats, mode, onOpen: open }) {
  if (!stats?.total) return <Empty icon={<Layers size={40} />} title="Not sorted into chapters yet" />;

  const grid = stats.grid || {};
  const chapterRank = (c) => (CHAPTERS.includes(c) ? CHAPTERS.indexOf(c) : CHAPTERS.length);
  const sectionRank = (s) => (SECTIONS.includes(s) ? SECTIONS.indexOf(s) : SECTIONS.length);

  if (mode === 'science') {
    const rows = Object.entries(stats.science || {}).sort((a, b) => sectionRank(a[0]) - sectionRank(b[0]));
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-500">Each section gathers its questions from every chapter.</p>
        {rows.map(([sec, n]) => {
          const chapters = byCount(Object.fromEntries(Object.entries(grid).map(([c, g]) => [c, g[sec] || 0]).filter(([, k]) => k)));
          return (
            <Row
              key={sec}
              icon={FlaskConical}
              title={sectionLabel(sec)}
              subtitle={`${plural(n, 'question')} across ${plural(chapters.length, 'chapter')}`}
              onOpen={() => open({ science: sec })}
              chips={chapters.slice(0, 8)}
              onChip={(chapter) => open({ chapter, science: sec })}
            />
          );
        })}
      </div>
    );
  }

  const rows = Object.entries(stats.chapters || {}).sort((a, b) => chapterRank(a[0]) - chapterRank(b[0]));
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500">Tap a chapter for all its questions, or a section to narrow it.</p>
      {rows.map(([chapter, n]) => {
        const sections = Object.entries(grid[chapter] || {}).sort((a, b) => sectionRank(a[0]) - sectionRank(b[0]));
        return (
          <Row
            key={chapter}
            icon={Layers}
            title={chapter}
            subtitle={`${plural(n, 'question')} · ${plural(sections.length, 'section')}`}
            onOpen={() => open({ chapter })}
            chips={sections}
            onChip={(science) => open({ chapter, science })}
          />
        );
      })}
    </div>
  );
}
