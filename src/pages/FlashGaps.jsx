// Flashcard progress and, more usefully, where the gaps are.
//
// The ranking deliberately holds back systems with only a handful of answers.
// Calling something a weakness on the strength of two wrong answers sends
// people off to revise the wrong thing, and it is the fastest way to make a
// progress screen untrustworthy.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Flame, Layers, Target, TrendingUp } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync, useList } from '../hooks/useData';
import { num } from '../lib/rtdb';
import { loadAllProgress, loadStats } from '../lib/flashcardData';
import { findGaps, isMastered } from '../lib/flashcards';
import BottomNav from '../components/BottomNav';
import { AppBar, Card, Empty, Page, SkeletonList } from '../components/ui';

const band = (accuracy) => {
  if (accuracy === null) return { label: 'Not enough answers', bar: 'bg-slate-300', text: 'text-slate-500' };
  if (accuracy >= 85) return { label: 'Strong', bar: 'bg-emerald-500', text: 'text-emerald-700' };
  if (accuracy >= 70) return { label: 'Getting there', bar: 'bg-sky-500', text: 'text-sky-700' };
  if (accuracy >= 50) return { label: 'Shaky', bar: 'bg-amber-500', text: 'text-amber-700' };
  return { label: 'Needs work', bar: 'bg-red-500', text: 'text-red-700' };
};

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="flex-1 min-w-[5rem] rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm">
      <Icon size={18} className="mx-auto text-violet-600" />
      <p className="font-display text-2xl mt-1 text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

export default function FlashGaps() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const decks = useList('flashdecks', { filter: (d) => isAdmin || String(d.publish) !== 'false' });
  const progress = useAsync(() => loadAllProgress(user?.uid), [user?.uid]);
  const stats = useAsync(() => loadStats(user?.uid), [user?.uid]);

  const gaps = useMemo(
    () => (decks.data.length ? findGaps(decks.data, progress.data || {}) : []),
    [decks.data, progress.data],
  );

  const mastered = useMemo(() => {
    let count = 0;
    Object.values(progress.data || {}).forEach((deck) => {
      Object.values(deck || {}).forEach((p) => {
        if (isMastered(p)) count += 1;
      });
    });
    return count;
  }, [progress.data]);

  const right = num(stats.data?.totalRight);
  const wrong = num(stats.data?.totalWrong);
  const accuracy = right + wrong ? Math.round((right / (right + wrong)) * 100) : null;

  // The weakest deck within a struggling system is the useful thing to offer:
  // "your neurology is weak" is not actionable, "open Seizures" is.
  const weakestDeckIn = (system) =>
    decks.data
      .filter((d) => (d.system || 'Other') === system)
      .map((deck) => {
        const p = progress.data?.[deck._key] || {};
        let r = 0;
        let w = 0;
        Object.values(p).forEach((entry) => {
          r += entry.right || 0;
          w += entry.wrong || 0;
        });
        return { deck, answered: r + w, accuracy: r + w ? (r / (r + w)) * 100 : 101 };
      })
      .filter((x) => x.answered > 0)
      .sort((a, b) => a.accuracy - b.accuracy)[0]?.deck;

  const loading = decks.loading || progress.loading || stats.loading;
  const hasAnswers = right + wrong > 0;

  return (
    <div className="min-h-screen pb-28">
      <AppBar title="Progress and gaps" />
      <Page className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Stat icon={Flame} value={num(stats.data?.streak) || 0} label="day streak" />
          <Stat icon={Layers} value={mastered} label="cards mastered" />
          <Stat icon={Target} value={accuracy === null ? '—' : `${accuracy}%`} label="accuracy" />
          <Stat icon={TrendingUp} value={num(stats.data?.sessions) || 0} label="sessions" />
        </div>

        {loading ? (
          <SkeletonList rows={4} />
        ) : !hasAnswers ? (
          <Empty icon={<TrendingUp size={40} />} title="Nothing to show yet">
            Study a few cards and this page will show which systems are letting you down.
          </Empty>
        ) : (
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <p className="font-display text-lg">By system, weakest first</p>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Based on {right + wrong} answered card{right + wrong === 1 ? '' : 's'}.
            </p>

            <div className="mt-4 space-y-4">
              {gaps.map((gap) => {
                const tone = band(gap.enough ? gap.accuracy : null);
                const target = gap.enough && gap.accuracy < 85 ? weakestDeckIn(gap.system) : null;
                return (
                  <div key={gap.system}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-slate-800 truncate">{gap.system}</p>
                      <p className={`text-sm font-semibold shrink-0 ${tone.text}`}>
                        {gap.enough ? `${gap.accuracy}%` : tone.label}
                      </p>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full transition-all ${tone.bar}`}
                        style={{ width: `${gap.enough ? gap.accuracy : 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {gap.answered} answered · {gap.mastered} mastered
                      {gap.enough ? ` · ${tone.label.toLowerCase()}` : ' · answer a few more to rank this'}
                    </p>
                    {target && (
                      <button
                        onClick={() => navigate(`/flashcards/deck/${encodeURIComponent(target._key)}`)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                      >
                        Work on “{target.title}” <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </Page>
      <BottomNav />
    </div>
  );
}
