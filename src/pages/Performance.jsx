// OverAllPerformanceActivity, grown into a dashboard.
//
// The original screen answered one question: what percentage of all the answers
// I have ever given were right. That is a score, not a study plan. What a
// reader needs next is where the marks are being lost — which topics are weak
// and which quizzes are worth another attempt — so the totals are joined here
// by a per-topic and a per-quiz breakdown, both built from what each finished
// session recorded (src/lib/quizHistory.js).
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { BarChart3, ListChecks, RotateCcw, Share2, Target, TrendingUp } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useData';
import { num, updateAt } from '../lib/rtdb';
import { loadDashboard, resetHistory } from '../lib/quizHistory';
import { shareImage } from '../lib/native';
import BottomNav from '../components/BottomNav';
import { AppBar, Avatar, Button, Card, Confirm, Page, Spinner, useToast } from '../components/ui';

function Donut({ correct, wrong }) {
  const total = correct + wrong;
  const r = 70;
  const c = 2 * Math.PI * r;
  const frac = total ? correct / total : 0;
  return (
    <svg viewBox="0 0 180 180" className="w-48 h-48 mx-auto -rotate-90" role="img" aria-label="Correct vs wrong answers">
      <circle cx="90" cy="90" r={r} fill="none" stroke={total ? '#EF4444' : '#E2E8F0'} strokeWidth="22" />
      {total > 0 && (
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke="#10B981"
          strokeWidth="22"
          strokeDasharray={`${c * frac} ${c}`}
          strokeLinecap={frac > 0 && frac < 1 ? 'round' : 'butt'}
        />
      )}
    </svg>
  );
}

/** Green when it is safe, amber when it needs work, red when it is a gap. */
const band = (pct) =>
  pct >= 75
    ? { bar: 'bg-emerald-500', text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-800' }
    : pct >= 50
      ? { bar: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-50 text-amber-800' }
      : { bar: 'bg-red-500', text: 'text-red-700', chip: 'bg-red-50 text-red-800' };

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-3 text-center">
      <p className="text-2xl font-bold text-brand-700 leading-tight">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function TopicRow({ topic }) {
  const b = band(topic.accuracy);
  return (
    <li className="py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 truncate text-slate-800">{topic.name}</span>
        <span className={`text-sm font-semibold ${b.text}`}>{topic.accuracy}%</span>
        <span className="text-xs text-slate-400 w-16 text-right">
          {topic.correct}/{topic.played}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 mt-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${b.bar}`} style={{ width: `${Math.max(topic.accuracy, 2)}%` }} />
      </div>
    </li>
  );
}

const when = (ms) => {
  if (!ms) return '';
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(ms).toLocaleDateString();
};

export default function Performance() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const cardRef = useRef(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showAllTopics, setShowAllTopics] = useState(false);
  const board = useAsync(() => loadDashboard(user.uid), [user.uid]);

  const totalPlay = num(profile?.total_play);
  const correct = num(profile?.total_correct);
  const wrong = Math.max(0, totalPlay - correct);
  const overall = profile?.over_all !== undefined ? `${profile.over_all} %` : 'N/A';

  const topics = board.data?.topics || [];
  const quizzes = board.data?.quizzes || [];
  const weakest = [...topics].sort((a, b) => a.accuracy - b.accuracy);
  const shownTopics = showAllTopics ? weakest : weakest.slice(0, 6);
  const attempts = quizzes.reduce((n, q) => n + q.attempts, 0);

  const share = async () => {
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      await shareImage(dataUrl, 'easypedia-performance.png', `My overall performance on Easy Pedia MCQs is ${overall}`);
    } catch (e) {
      if (e?.name !== 'AbortError') toast(`Could not share: ${e.message || e}`, 'error');
    }
  };

  const reset = async () => {
    setConfirmReset(false);
    await updateAt(`quizusers/${user.uid}`, { over_all: '0', total_correct: '0', total_play: '0' });
    await resetHistory(user.uid);
    board.reload();
    toast('Statistics reset', 'success');
  };

  return (
    <div className="min-h-screen pb-28">
      <AppBar title="My performance" back={false} />
      <Page className="space-y-4">
        <div ref={cardRef} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <Avatar src={profile?.img} size={48} />
            <p className="font-semibold text-slate-800">{profile?.name}</p>
          </div>
          <p className="text-slate-500 text-sm mt-4">Overall performance is</p>
          <p className="text-4xl font-bold text-brand-700">{overall}</p>
          <div className="relative my-5">
            <Donut correct={correct} wrong={wrong} />
          </div>
          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">Total correct</p>
              <p className="text-xl font-bold text-emerald-700">{correct} answers</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-xs text-red-700">Total wrong</p>
              <p className="text-xl font-bold text-red-700">{wrong} answers</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-4">Easy Pedia MCQs</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Questions answered" value={totalPlay} />
          <Stat label="Quizzes played" value={quizzes.length} hint={attempts ? `${attempts} attempt/s` : ''} />
          <Stat label="Topics covered" value={topics.length} />
          <Stat
            label="Strong topics"
            value={topics.filter((t) => t.accuracy >= 75).length}
            hint={`of ${topics.length || 0}`}
          />
        </div>

        {/* ------------------------------------------------------ by topic */}
        <Card className="p-5">
          <h3 className="font-display text-lg flex items-center gap-2 text-slate-800">
            <BarChart3 className="text-brand-600" size={20} /> Accuracy by topic
          </h3>
          {board.loading ? (
            <Spinner />
          ) : topics.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              Finish a quiz and this fills in with the topics of the questions you answered.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-500 mt-1">Weakest first — that is where revision pays.</p>
              <ul className="mt-3 divide-y divide-slate-100">
                {shownTopics.map((t) => (
                  <TopicRow key={t.key} topic={t} />
                ))}
              </ul>
              {weakest.length > shownTopics.length && (
                <Button variant="ghost" className="w-full mt-2" onClick={() => setShowAllTopics(true)}>
                  Show all {weakest.length} topics
                </Button>
              )}
            </>
          )}
        </Card>

        {/* -------------------------------------------- what to do next */}
        {!board.loading && weakest.length > 0 && (
          <Card className="p-5">
            <h3 className="font-display text-lg flex items-center gap-2 text-slate-800">
              <Target className="text-red-500" size={20} /> Where to focus
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {weakest.slice(0, 3).map((t) => (
                <li key={t.key} className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${band(t.accuracy).chip}`}>
                    {t.accuracy}%
                  </span>
                  <span className="truncate">{t.name}</span>
                  <span className="text-xs text-slate-400 ml-auto shrink-0">{t.played - t.correct} missed</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 mt-3">
              Open any quiz you have played and choose <b>Only questions I answered wrongly</b> to work through the
              ones you missed.
            </p>
            <Link to="/mcqs" className="inline-block mt-3">
              <Button variant="secondary">
                <ListChecks size={18} /> Go to the question banks
              </Button>
            </Link>
          </Card>
        )}

        {/* ----------------------------------------------------- by quiz */}
        <Card className="p-5">
          <h3 className="font-display text-lg flex items-center gap-2 text-slate-800">
            <TrendingUp className="text-emerald-600" size={20} /> Quiz by quiz
          </h3>
          {board.loading ? (
            <Spinner />
          ) : quizzes.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">Your finished quizzes will be listed here, newest first.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {quizzes.map((q) => {
                const accuracy = q.played ? Math.round((q.correct / q.played) * 100) : 0;
                const b = band(accuracy);
                return (
                  <li key={q.pkey} className="py-3">
                    <div className="flex items-baseline gap-2">
                      <span className="flex-1 truncate font-medium text-slate-800">{q.title}</span>
                      <span className={`text-sm font-semibold ${b.text}`}>{accuracy}%</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                      <span>{q.attempts} attempt/s</span>
                      <span>best {q.best}%</span>
                      <span>last {q.last}%</span>
                      <span>
                        {q.correct}/{q.played} answers
                      </span>
                      {q.at ? <span className="ml-auto">{when(q.at)}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Button className="w-full !py-3" onClick={share}>
          <Share2 size={18} /> Share your performance
        </Button>
        <Button variant="outline" className="w-full" onClick={() => setConfirmReset(true)}>
          <RotateCcw size={18} /> Reset statistics
        </Button>
      </Page>
      <BottomNav />
      <Confirm
        open={confirmReset}
        danger
        message="Reset all statistics? This also clears the record of which questions you have answered, so 'not answered' and 'answered wrongly' start from scratch."
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
