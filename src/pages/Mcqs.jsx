// Question banks. This was the old main page; it moved here when the app
// grew other sections.
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useList } from '../hooks/useData';
import { num } from '../lib/rtdb';
import BottomNav from '../components/BottomNav';
import { AccessMark } from '../components/LockPanel';
import { useAccessCheck } from '../hooks/useQuizAccess';
import { bankScopes, scopeKey } from '../lib/access';
import { countLine, countsBySource, sumCounts } from '../lib/catalogCounts';
import DailyQuiz, { useDailyQuiz } from '../components/DailyQuiz';
import { AppBar, Empty, ErrorBox, Page, Thumb } from '../components/ui';

function CategoryCard({ c, onClick, hidden, line, level }) {
  return (
    <button
      onClick={onClick}
      className="group text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition overflow-hidden flex sm:flex-col"
    >
      <Thumb src={c.img} label={c.title} className="h-24 w-24 sm:h-32 sm:w-full rounded-none text-3xl" />
      <div className="flex-1 p-4 flex items-center gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="font-display text-slate-900 leading-snug line-clamp-2">{c.title}</p>
          <p className="text-xs text-slate-500 mt-1">{hidden ? 'Not published' : line || 'Tap to open'}</p>
        </div>
        <AccessMark level={level} />
        <ChevronRight className="text-slate-300 group-hover:text-brand-500 shrink-0" size={20} />
      </div>
    </button>
  );
}

export default function Mcqs() {
  const { isAdmin, access } = useAuth();
  const levelOf = useAccessCheck();
  const navigate = useNavigate();
  const daily = useDailyQuiz();

  // Admins also see unpublished categories (same as the Android app).
  const categories = useList('main_category', {
    filter: (c) => isAdmin || String(c.publish) === 'true',
  });
  const quizzes = useList('allquiz');
  const books = useList('mcqs');
  const counts = countsBySource(quizzes.data);
  const bankLine = (bank) => {
    const sources = books.data.filter((b) => b.main_category === bank && String(b.type) === 'quiz');
    return sources.length ? countLine(sumCounts(counts, sources.map((b) => b.source))) : '';
  };
  // Locked only when nothing in the bank is unlocked: a bank with one open
  // group or book shows no lock.
  const bankLevel = (bank) => {
    const level = levelOf(bankScopes(bank));
    if (level !== 'locked') return level;
    const keys = Object.keys(access?.unlocks || {});
    const mine = new Set([
      ...books.data.filter((b) => b.main_category === bank).map((b) => scopeKey('book', b.source)),
    ]);
    return keys.some((k) => k.startsWith(`group~${bank}|`) || mine.has(k)) ? 'full' : 'locked';
  };

  const totalQuestions = quizzes.data
    .filter((q) => String(q.preview) !== 'true')
    .reduce((sum, q) => sum + num(q.number), 0);

  return (
    <div className="min-h-screen pb-28">
      <AppBar
        title="MCQs"
        subtitle={totalQuestions ? `${totalQuestions.toLocaleString()} questions` : undefined}
      />
      <Page className="space-y-5">
        <DailyQuiz daily={daily} />

        <div>
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-display text-slate-800 text-xl">Question banks</h2>
            {categories.data.length > 0 && (
              <span className="text-xs text-slate-400">{categories.data.length} banks</span>
            )}
          </div>
          <ErrorBox error={!categories.data.length && categories.error} onRetry={categories.reload} />
          {categories.loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 sm:h-48 rounded-2xl bg-slate-200/70 animate-pulse" />
              ))}
            </div>
          ) : categories.data.length === 0 && !categories.error ? (
            <Empty icon={<BookOpen size={40} />} title="No question banks yet" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {categories.data.map((c) => (
                <CategoryCard
                  key={c._key}
                  c={c}
                  hidden={isAdmin && String(c.publish) !== 'true'}
                  line={bankLine(c.source)}
                  level={bankLevel(c.source)}
                  onClick={() =>
                    navigate(`/cat/${encodeURIComponent(c.source)}?title=${encodeURIComponent(c.title || '')}`)
                  }
                />
              ))}
            </div>
          )}
        </div>
      </Page>
      <BottomNav />
    </div>
  );
}
