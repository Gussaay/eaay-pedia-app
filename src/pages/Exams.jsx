// HomeActivity: the quizzes of a book, "By exam" (allquiz) or, for collection
// books (source contains "smsb"), "By system" (chapters).
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { useList } from '../hooks/useData';
import { num } from '../lib/rtdb';
import { quizPath } from '../lib/quizSource';
import { AppBar, Empty, ErrorBox, ListCard, OfflineBanner, Page, SkeletonList } from '../components/ui';

const countBadge = (n) =>
  n ? <span className="text-xs font-semibold bg-brand-50 text-brand-700 rounded-full px-2 py-1 shrink-0">{n} Qs</span> : null;

export default function Exams() {
  const { source } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const type = params.get('type') || '';
  const name = params.get('name') || '';
  const editMode = params.get('mode') === 'edit';
  const isCollection = source.includes('smsb');
  const [tab, setTab] = useState('exam');

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

  const active = tab === 'exam' ? exams : chapters;

  return (
    <div className="min-h-screen">
      <AppBar title={name || 'Quizzes'} subtitle={editMode ? 'Edit mode — tap a quiz to edit it' : undefined} />
      <OfflineBanner />
      {isCollection && !editMode && (
        <div className="sticky top-14 z-20 bg-white border-b border-slate-100">
          <div className="max-w-3xl mx-auto flex">
            {[
              ['exam', 'By exam'],
              ['system', 'By system'],
            ].map(([k, label]) => (
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
        <ErrorBox error={!active.data.length && active.error} onRetry={active.reload} />
        {active.loading ? (
          <SkeletonList rows={6} />
        ) : active.data.length === 0 ? (
          <Empty icon={<FileQuestion size={40} />} title="No quizzes yet" />
        ) : tab === 'exam' ? (
          <div className="space-y-3">
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
          <div className="space-y-3">
            {chapters.data.map((c) => (
              <ListCard
                key={c._key}
                img={c.chapter_img || '/icon.png'}
                title={c.chapter}
                badge={countBadge(num(c[`${type}number`]))}
                onClick={() => navigate(quizPath('chapter', c._key, { type, source, name }))}
              />
            ))}
          </div>
        )}
      </Page>
    </div>
  );
}
