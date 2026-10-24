// McqsMainActivity: the sub-books (mcqs) of one main category, plus the same
// bank browsed every other way: every quiz by name, and every question by
// chapter or by basic science (components/QuestionBrowser.jsx). A bank can
// gather its books into groups (lib/bookGroups.js); ?group=<key> lists one.
import { useMemo, useState } from 'react';
import { countLine, countsBySource, sumCounts } from '../lib/catalogCounts';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookMarked, FileQuestion, FlaskConical, FolderOpen, Layers, Library, Search } from 'lucide-react';
import { useList } from '../hooks/useData';
import { num } from '../lib/rtdb';
import { quizPath } from '../lib/quizSource';
import QuestionBrowser, { BrowseTabs } from '../components/QuestionBrowser';
import { AccessMark, UnlockSheet } from '../components/LockPanel';
import { useAccessCheck } from '../hooks/useQuizAccess';
import { bookScopes, groupScopes, unlockChoices } from '../lib/access';
import { groupBooks } from '../lib/bookGroups';
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

/** Every quiz by name, from the books this person may open: locked books keep their quiz names to themselves. */
function QuizzesByName({ books: allBooks, bank }) {
  const navigate = useNavigate();
  const levelOf = useAccessCheck();
  const [q, setQ] = useState('');
  const books = useMemo(
    () => allBooks.filter((b) => levelOf(bookScopes({ source: b.source, group: b.group, bank })) !== 'locked'),
    [allBooks, levelOf, bank],
  );
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
      {books.length === 0 ? (
        <Empty icon={<FileQuestion size={40} />} title="Quizzes are locked">
          Open a book under Sources and tap Unlock to see its quizzes.
        </Empty>
      ) : quizzes.loading ? (
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
                num(x.number) ? (
                  <span className="text-xs font-semibold bg-brand-50 text-brand-700 rounded-full px-2 py-1 shrink-0">{num(x.number)} Qs</span>
                ) : null
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
  const group = params.get('group') || '';
  const canBrowse = !editMode && !group && source !== '*';
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
  const bankRecord = useList(source === '*' ? null : 'main_category', { filter: (c) => c.source === source });
  const { groups, loose } = groupBooks(books.data, bankRecord.data[0]);
  const openGroup = groups.find((g) => g.key === group);
  const shown = group ? openGroup?.books || [] : loose;
  const bankTitle = params.get('title') || bankRecord.data[0]?.title || 'Books';
  const levelOf = useAccessCheck();
  const allQuizzes = useList(editMode ? null : 'allquiz');
  const counts = useMemo(() => countsBySource(allQuizzes.data), [allQuizzes.data]);
  const [sheet, setSheet] = useState(null);
  const bookLevel = (b) => (editMode ? 'full' : levelOf(bookScopes({ source: b.source, group: b.group, bank: b.main_category })));

  const openBook = (b) => {
    if (bookLevel(b) === 'locked') {
      const g = groups.find((x) => x.key === String(b.group || '').trim());
      setSheet({
        title: g ? g.title : b.title,
        counts: g ? sumCounts(counts, g.books.map((x) => x.source)) : counts.get(b.source),
        choices: unlockChoices({
          bank: b.main_category,
          bankTitle,
          group: g?.key,
          groupTitle: g?.title,
          book: b.source,
          bookTitle: b.title,
        }),
      });
      return;
    }
    const qs = new URLSearchParams({ name: b.title || '', type: b.sub_category || '' });
    if (editMode) qs.set('mode', 'edit');
    navigate(`/book/${encodeURIComponent(b.source)}?${qs}`);
  };
  const openGroupPage = (g) => {
    const qs = new URLSearchParams(params);
    qs.set('group', g.key);
    navigate(`/cat/${encodeURIComponent(source)}?${qs}`);
  };

  // Chapter and science sets gather questions from every book, so only the
  // whole bank opens them.
  const lockedBank = () =>
    setSheet({
      title: bankTitle,
      counts: sumCounts(counts, books.data.map((b) => b.source)),
      choices: unlockChoices({ bank: source, bankTitle }),
    });

  return (
    <div className="min-h-screen">
      <AppBar
        title={group ? openGroup?.title || group : bankTitle}
        subtitle={editMode ? 'Edit mode' : group ? [bankTitle, openGroup?.subtitle].filter(Boolean).join(' · ') : undefined}
      />
      <Page className="space-y-4">
        {canBrowse && <BrowseTabs tabs={TABS} tab={tab} onChange={setTab} />}

        {tab === 'sources' && (
          <>
            <ErrorBox error={!books.data.length && books.error} onRetry={books.reload} />
            {books.loading ? (
              <SkeletonList />
            ) : shown.length + (group ? 0 : groups.length) === 0 ? (
              <Empty icon={<Library size={40} />} title="Nothing here yet">
                New books will appear here once they are published.
              </Empty>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {!group &&
                  groups.map((g) => (
                    <ListCard
                      key={`group:${g.key}`}
                      img={g.img}
                      title={g.subtitle ? `${g.title} · ${g.subtitle}` : g.title}
                      subtitle={countLine(
                        sumCounts(counts, g.books.map((b) => b.source)),
                        `${g.books.length} ${g.books.length === 1 ? 'book' : 'books'}`,
                      )}
                      badge={
                        editMode ? (
                          <FolderOpen size={18} className="text-brand-500 shrink-0" />
                        ) : (
                          <AccessMark level={levelOf(groupScopes({ group: g.key, bank: source }))} />
                        )
                      }
                      onClick={() => openGroupPage(g)}
                    />
                  ))}
                {shown.map((b) => (
                  <ListCard
                    key={b._key}
                    img={b.img}
                    title={b.title}
                    subtitle={counts.get(b.source) ? countLine(counts.get(b.source)) : undefined}
                    badge={<AccessMark level={bookLevel(b)} />}
                    onClick={() => openBook(b)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'quizzes' && (books.loading ? <SkeletonList /> : <QuizzesByName books={books.data} bank={source} />)}
        {tab === 'chapters' && <QuestionBrowser bank={source} name={params.get('title') || ''} mode="chapters" onLocked={lockedBank} />}
        {tab === 'science' && <QuestionBrowser bank={source} name={params.get('title') || ''} mode="science" onLocked={lockedBank} />}
      </Page>
      <UnlockSheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={sheet?.title}
        counts={sheet?.counts}
        choices={sheet?.choices}
        path={`/cat/${encodeURIComponent(source)}?${params}`}
      />
    </div>
  );
}
