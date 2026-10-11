// Browsing a question bank (or one book) the way mnemonics are browsed:
//
//   Chapters        one row per clinical chapter, with its basic-science sections
//   Basic science   one row per section, gathering it from every chapter
//
// Every row and chip opens a "set" quiz (lib/quizSource.js, kind "set") made of
// those questions. Counts come from qbrowse/<bank> (written by
// .tmp/link/browse.mjs), so the lists open without reading every question.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FlaskConical, Layers } from 'lucide-react';
import { useAsync } from '../hooks/useData';
import { getOne } from '../lib/rtdb';
import { quizPath } from '../lib/quizSource';
import { CHAPTERS, SECTIONS, setId } from '../lib/questionBrowse';
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
