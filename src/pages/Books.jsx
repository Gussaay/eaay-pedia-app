// McqsMainActivity: the sub-books (mcqs) of one main category, plus the same
// bank browsed every other way: every quiz by name, and every question by
// chapter or by basic science (components/QuestionBrowser.jsx).
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookMarked, FileQuestion, FlaskConical, Layers, Library, Search } from 'lucide-react';
import { useList } from '../hooks/useData';
import { num } from '../lib/rtdb';
import { quizPath } from '../lib/quizSource';
import QuestionBrowser, { BrowseTabs } from '../components/QuestionBrowser';
import { AccessMark } from '../components/LockPanel';
import { useAccessCheck } from '../hooks/useQuizAccess';
import { quizScopes } from '../lib/access';
import { AppBar, Empty, ErrorBox, ListCard, Page, SkeletonList } from '../components/ui';

const TABS = [
  { key: 'sources', label: 'Sources', icon: BookMarked },
  { key: 'quizzes', label: 'By name', icon: FileQuestion },
  { key: 'chapters', label: 'Chapters', icon: Layers },
  { key: 'science', label: 'Science', icon: FlaskConical },
];

const tabKey = (source) => `bank-tab:${source}`;
const readTab = (source) => {
  try {
    return sessionStorage.getItem(tabKey(source)) || 'sources';
  } catch {
    return 'sources';
  }
};

function QuizzesByName({ books, bank }) {
  const navigate = useNavigate();
  const levelOf = useAccessCheck();
  const [q, setQ] = useState('');
  const titleOf = useMemo(() => new Map(books.map((b) => [b.source, b.title])), [books]);
  const quizzes = useList('allquiz', {
    filter: (x) => titleOf.has(x.source) && String(x.preview) === 'false',
  });
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return quizzes.data
      .filter((x) => !needle || `${x.title} ${titleOf.get(x.source)}`.toLowerCase().includes(needle))
      .sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { numeric: true, sensitivity: 'base' }));
  }, [quizzes.data, q, titleOf]);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 focus-within:border-brand-400">
        <Search size={18} className="text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search quizzes by name or book"
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>
      <ErrorBox error={!quizzes.data.length && quizzes.error} onRetry={quizzes.reload} />
      {quizzes.loading ? (
        <SkeletonList rows={6} />
      ) : list.length === 0 ? (
        <Empty icon={<FileQuestion size={40} />} title={q ? 'No quiz matches' : 'No quizzes yet'} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((x) => (
            <ListCard
              key={x._key}
              img={x.img}
              title={String(x.title || '').replace('MCQs', '').trim()}
              subtitle={titleOf.get(x.source)}
              badge={
                <>
                  <AccessMark level={levelOf(quizScopes({ id: x._key, source: x.source, bank }))} />
                  {num(x.number) ? (
                    <span className="text-xs font-semibold bg-brand-50 text-brand-700 rounded-full px-2 py-1 shrink-0">{num(x.number)} Qs</span>
                  ) : null}
                </>
              }
              onClick={() => navigate(quizPath('exam', x._key, { name: titleOf.get(x.source) || '', source: x.source }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Books() {
  const { source } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const editMode = params.get('mode') === 'edit';
  const canBrowse = !editMode && source !== '*';
  const [tab, setTabState] = useState(() => (canBrowse ? readTab(source) : 'sources'));
  const setTab = (t) => {
    setTabState(t);
    try {
      sessionStorage.setItem(tabKey(source), t);
    } catch {
      /* private mode: the tab just resets */
    }
  };

  const books = useList('mcqs', {
    filter: (b) => String(b.type) === 'quiz' && (source === '*' || b.main_category === source),
  });

  return (
    <div className="min-h-screen">
      <AppBar title={params.get('title') || 'Books'} subtitle={editMode ? 'Edit mode' : undefined} />
      <Page className="space-y-4">
        {canBrowse && <BrowseTabs tabs={TABS} tab={tab} onChange={setTab} />}

        {tab === 'sources' && (
          <>
            <ErrorBox error={!books.data.length && books.error} onRetry={books.reload} />
            {books.loading ? (
              <SkeletonList />
            ) : books.data.length === 0 ? (
              <Empty icon={<Library size={40} />} title="Nothing here yet">
                New books will appear here once they are published.
              </Empty>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {books.data.map((b) => (
                  <ListCard
                    key={b._key}
                    img={b.img}
                    title={b.title}
                    onClick={() => {
                      const qs = new URLSearchParams({ name: b.title || '', type: b.sub_category || '' });
                      if (editMode) qs.set('mode', 'edit');
                      navigate(`/book/${encodeURIComponent(b.source)}?${qs}`);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'quizzes' && (books.loading ? <SkeletonList /> : <QuizzesByName books={books.data} bank={source} />)}
        {tab === 'chapters' && <QuestionBrowser bank={source} name={params.get('title') || ''} mode="chapters" />}
        {tab === 'science' && <QuestionBrowser bank={source} name={params.get('title') || ''} mode="science" />}
      </Page>
    </div>
  );
}
