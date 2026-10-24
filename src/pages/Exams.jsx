// HomeActivity: the quizzes of a book, "By exam" (allquiz) or, for collection
// books (source contains "smsb"), "By system" (chapters). Every book can also be
// browsed by chapter and by basic science, and practised by repeated, similar,
// unanswered or wrongly answered questions (components/QuestionBrowser.jsx).
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { useList } from '../hooks/useData';
import { num } from '../lib/rtdb';
import { quizPath } from '../lib/quizSource';
import QuestionBrowser, { PracticeSets } from '../components/QuestionBrowser';
import { AccessMark, LockedNotice, UnlockSheet } from '../components/LockPanel';
import { useAccessCheck } from '../hooks/useQuizAccess';
import { bookScopes, scopesOf, unlockChoices } from '../lib/access';
import { groupBooks } from '../lib/bookGroups';
import { AppBar, Empty, ErrorBox, ListCard, Page, SkeletonList } from '../components/ui';

const countBadge = (n, level) => (
  <>
    <AccessMark level={level} />
    {n ? <span className="text-xs font-semibold bg-brand-50 text-brand-700 rounded-full px-2 py-1 shrink-0">{n} Qs</span> : null}
  </>
);

export default function Exams() {
  const { source } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const type = params.get('type') || '';
  const name = params.get('name') || '';
  const editMode = params.get('mode') === 'edit';
  const isCollection = source.includes('smsb');
  const [tab, setTab] = useState('exam');
  const levelOf = useAccessCheck();

  const exams = useList('allquiz', {
    filter: (q) =>
      String(q.source || '').includes(source) &&
      String(q.preview) === 'false' &&
      (!isCollection || String(q.type || '').includes(type)),
    // Android inserted each child at the top: newest first.
    sort: (a, b) => (a._key < b._key ? 1 : -1),
  });

  const chapters = useList(isCollection ? 'chapters' : null, {
    filter: (c) => String(c.collection) === 'true' && c[type] === type,
    sort: (a, b) => num(b[`${type}number`]) - num(a[`${type}number`]),
  });

  const book = useList(editMode ? null : 'mcqs', { filter: (b) => b.source === source });
  const bank = book.data[0]?.main_category || '';
  const groupKey = String(book.data[0]?.group || '').trim();
  const bankRecord = useList(bank ? 'main_category' : null, { filter: (c) => c.source === bank });
  const allBooks = useList(groupKey ? 'mcqs' : null, { filter: (b) => b.main_category === bank });
  const [sheet, setSheet] = useState(false);
  // A locked book shows only its size: no quiz names (lib/access.js).
  const locked =
    !editMode && !book.loading && levelOf(bookScopes({ source, group: groupKey, bank })) === 'locked';
  const tabs = [
    ['exam', 'By exam'],
    ...(isCollection ? [['system', 'By system']] : []),
    ...(bank ? [['chapters', 'Chapters'], ['science', 'Science'], ['practice', 'Practice']] : []),
  ];
  const lockedGroup = groupKey ? groupBooks(allBooks.data, bankRecord.data[0]).groups.find((g) => g.key === groupKey) : null;
  const browsing = tab === 'chapters' || tab === 'science' || tab === 'practice';
  const active = tab === 'exam' ? exams : chapters;

  return (
    <div className="min-h-screen">
      <AppBar title={name || 'Quizzes'} subtitle={editMode ? 'Edit mode — tap a quiz to edit it' : undefined} />
      {locked ? (
        <Page>
          {exams.loading ? (
            <SkeletonList rows={2} />
          ) : (
            <LockedNotice
              title={name || 'This book'}
              counts={{ quizzes: exams.data.length, questions: exams.data.reduce((t, q) => t + num(q.number), 0) }}
              onUnlock={() => setSheet(true)}
            />
          )}
          <UnlockSheet
            open={sheet}
            onClose={() => setSheet(false)}
            title={lockedGroup ? lockedGroup.title : name}
            counts={groupKey ? undefined : { quizzes: exams.data.length, questions: exams.data.reduce((t, q) => t + num(q.number), 0) }}
            choices={unlockChoices({
              bank,
              bankTitle: bankRecord.data[0]?.title || bank,
              group: groupKey,
              groupTitle: lockedGroup?.title,
              book: source,
              bookTitle: name,
            })}
            path={`/book/${encodeURIComponent(source)}?${params}`}
          />
        </Page>
      ) : (
      <>
      {!editMode && tabs.length > 1 && (
        <div className="sticky top-14 z-20 bg-white border-b border-slate-100">
          <div className="max-w-3xl mx-auto flex">
            {tabs.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex-1 py-3 text-sm font-semibold border-b-2 ${
                  tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <Page>
        {browsing ? (
          tab === 'practice' ? (
            <PracticeSets bank={bank} book={source} bookTitle={name} name={name} />
          ) : (
            <QuestionBrowser bank={bank} book={source} bookTitle={name} name={name} mode={tab} />
          )
        ) : (
          <>
        <ErrorBox error={!active.data.length && active.error} onRetry={active.reload} />
        {active.loading ? (
          <SkeletonList rows={6} />
        ) : active.data.length === 0 ? (
          <Empty icon={<FileQuestion size={40} />} title="No quizzes yet" />
        ) : tab === 'exam' ? (
          <div className="grid gap-3 md:grid-cols-2">
            {exams.data.map((q) => (
              <ListCard
                key={q._key}
                img={q.img}
                title={String(q.title || '').replace('MCQs', '').trim()}
                subtitle={q.uploader ? `by ${q.uploader}` : q.des}
                badge={countBadge(num(q.number))}
                onClick={() =>
                  navigate(
                    editMode
                      ? `/admin/quiz/${encodeURIComponent(q._key)}`
                      : quizPath('exam', q._key, { name, source }),
                  )
                }
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {chapters.data.map((c) => (
              <ListCard
                key={c._key}
                img={c.chapter_img}
                title={c.chapter}
                badge={countBadge(
                  num(c[`${type}number`]),
                  levelOf(scopesOf({ kind: 'chapter', pkey: `${c._key}${type}`, source }, { bank, group: groupKey })),
                )}
                onClick={() => navigate(quizPath('chapter', c._key, { type, source, name }))}
              />
            ))}
          </div>
        )}
          </>
        )}
      </Page>
      </>
      )}
    </div>
  );
}
