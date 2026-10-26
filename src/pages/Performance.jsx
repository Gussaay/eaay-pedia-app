// OverAllPerformanceActivity, grown into a dashboard.
//
// The original screen answered one question: what percentage of all the answers
// I have ever given were right. That is a score, not a study plan. What a
// reader needs next is where the marks are being lost — which topics are weak
// and which quizzes are worth another attempt — so the totals are joined here
// by a per-topic and a per-quiz breakdown, both built from what each finished
// session recorded (src/lib/quizHistory.js). Topics come from each question
// (its clinical system, basic science and specific tag, lib/performance.js);
// answers given in the "Linked questions" list count as well.
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { BarChart3, CalendarDays, FlaskConical, ListChecks, RotateCcw, Share2, Tag, Target, TrendingUp } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useData';
import { num, updateAt } from '../lib/rtdb';
import { loadDashboard, resetHistory } from '../lib/quizHistory';
import { lastDays, rankTopics, streakOf, totalOf } from '../lib/performance';
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

function TopicList({ rows, limit = 6, empty }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <p className="text-sm text-slate-500 py-4">{empty}</p>;
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <>
      <ul className="mt-3 divide-y divide-slate-100">
        {shown.map((t) => (
          <TopicRow key={t.key} topic={t} />
        ))}
      </ul>
      {rows.length > shown.length && (
        <Button variant="ghost" className="w-full mt-2" onClick={() => setAll(true)}>
          Show all {rows.length}
        </Button>
      )}
    </>
  );
}

const dayLabel = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' });

/** Answers per day for the last two weeks; each bar coloured by that day's accuracy. */
function Activity({ days }) {
  const list = lastDays(days, 14);
  const max = Math.max(1, ...list.map((d) => d.played));
  const week = totalOf(list.slice(7));
  const before = totalOf(list.slice(0, 7));
  const change = week.accuracy !== null && before.accuracy !== null ? week.accuracy - before.accuracy : null;
  return (
    <>
      <div className="mt-4 flex items-end gap-1 h-28" role="img" aria-label="Answers per day, last 14 days">
        {list.map((d) => {
          const pct = d.played ? Math.round((d.correct / d.played) * 100) : 0;
          return (
            <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
              <div
                className={`w-full rounded-t-md ${d.played ? band(pct).bar : 'bg-slate-100'}`}
                style={{ height: d.played ? `${Math.max((d.played / max) * 100, 6)}%` : '4px' }}
                title={`${d.day}: ${d.played} answered${d.played ? `, ${pct}% right` : ''}`}
              />
              <span className="text-[10px] text-slate-400 leading-none">{dayLabel(d.day)}</span>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Last 7 days</p>
          <p className="font-semibold text-slate-800">
            {week.played} answered{week.accuracy !== null ? ` · ${week.accuracy}%` : ''}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">The 7 days before</p>
          <p className="font-semibold text-slate-800">
            {before.played} answered{before.accuracy !== null ? ` · ${before.accuracy}%` : ''}
          </p>
        </div>
      </div>
      {change !== null && change !== 0 && (
        <p className={`text-xs mt-2 ${change > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
          Accuracy {change > 0 ? 'up' : 'down'} {Math.abs(change)} points on the week before.
        </p>
      )}
    </>
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
  const board = useAsync(() => loadDashboard(user.uid), [user.uid]);

  const totalPlay = num(profile?.total_play);
  const correct = num(profile?.total_correct);
  const wrong = Math.max(0, totalPlay - correct);
  const overall = profile?.over_all !== undefined ? `${profile.over_all} %` : 'N/A';

  const d = board.data || {};
  const topics = d.topics || [];
  const quizzes = d.quizzes || [];
  const weakest = [...topics].sort((a, b) => a.accuracy - b.accuracy || b.played - a.played);
  const sciences = [...(d.sciences || [])].sort((a, b) => a.accuracy - b.accuracy || b.played - a.played);
  const tagRank = rankTopics(d.tags || [], 3);
  const attempts = quizzes.reduce((n, q) => n + q.attempts, 0);
  const linked = d.linked || { played: 0, correct: 0 };
  const week = totalOf(lastDays(d.days, 7));
  const streak = streakOf(d.days);
  // The weakest systems and specific topics below 75%; the weakest system even if all are above.
  const weakSystems = weakest.filter((t) => t.accuracy < 75).slice(0, 3);
  const focus = [
    ...(weakSystems.length ? weakSystems : weakest.slice(0, 1)),
    ...tagRank.weak.filter((t) => t.accuracy < 75).slice(0, 3),
  ];

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
          <Stat label="Questions answered" value={totalPlay} hint={d.distinct ? `${d.distinct} different` : ''} />
          <Stat label="To revisit" value={d.toRevisit ?? 0} hint="last answer wrong" />
          <Stat label="Day streak" value={streak} hint={streak === 1 ? 'day' : 'days'} />
          <Stat
            label="This week"
            value={week.played}
            hint={week.accuracy !== null ? `${week.accuracy}% right` : 'answered'}
          />
          <Stat label="Quizzes played" value={quizzes.length} hint={attempts ? `${attempts} attempt/s` : ''} />
          <Stat
            label="Linked questions"
            value={linked.played}
            hint={linked.played ? `${Math.round((linked.correct / linked.played) * 100)}% right` : 'answered'}
          />
          <Stat label="Systems covered" value={topics.length} hint={`${topics.filter((t) => t.accuracy >= 75).length} strong`} />
          <Stat label="Specific topics" value={(d.tags || []).length} hint={`${tagRank.strong.filter((t) => t.accuracy >= 75).length} strong`} />
        </div>

        {/* ---------------------------------------------------- activity */}
        <Card className="p-5">
          <h3 className="font-display text-lg flex items-center gap-2 text-slate-800">
            <CalendarDays className="text-brand-600" size={20} /> Activity
          </h3>
          <p className="text-xs text-slate-500 mt-1">Answers per day over the last two weeks, coloured by how many were right.</p>
          {board.loading ? <Spinner /> : <Activity days={d.days} />}
        </Card>

        {/* ------------------------------------------------------ by topic */}
        <Card className="p-5">
          <h3 className="font-display text-lg flex items-center gap-2 text-slate-800">
            <BarChart3 className="text-brand-600" size={20} /> Accuracy by system
          </h3>
          {board.loading ? (
            <Spinner />
          ) : (
            <>
              {topics.length > 0 && (
                <p className="text-xs text-slate-500 mt-1">Weakest first — that is where revision pays.</p>
              )}
              <TopicList
                rows={weakest}
                empty="Finish a quiz and this fills in with the systems of the questions you answered."
              />
            </>
          )}
        </Card>

        {/* ----------------------------------------------- specific topics */}
        {!board.loading && (d.tags || []).length > 0 && (
          <Card className="p-5">
            <h3 className="font-display text-lg flex items-center gap-2 text-slate-800">
              <Tag className="text-sky-600" size={20} /> Specific topics
            </h3>
            <p className="text-xs text-slate-500 mt-1">Topics you have answered at least 3 times.</p>
            {tagRank.enough === 0 ? (
              <p className="text-sm text-slate-500 py-4">Keep going: none has 3 answers yet.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-x-6">
                <div>
                  <p className="text-sm font-semibold text-red-700 mt-3">Needs work</p>
                  <TopicList rows={tagRank.weak.filter((t) => t.accuracy < 75)} limit={5} empty="Nothing below 75%." />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-700 mt-3">Strong</p>
                  <TopicList rows={tagRank.strong.filter((t) => t.accuracy >= 75)} limit={5} empty="None at 75% or more yet." />
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ---------------------------------------------- basic sciences */}
        {!board.loading && sciences.length > 0 && (
          <Card className="p-5">
            <h3 className="font-display text-lg flex items-center gap-2 text-slate-800">
              <FlaskConical className="text-violet-600" size={20} /> By basic science
            </h3>
            <TopicList rows={sciences} limit={8} empty="" />
          </Card>
        )}

        {/* -------------------------------------------- what to do next */}
        {!board.loading && focus.length > 0 && (
          <Card className="p-5">
            <h3 className="font-display text-lg flex items-center gap-2 text-slate-800">
              <Target className="text-red-500" size={20} /> Where to focus
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {focus.map((t) => (
                <li key={`${t.key}:${t.name}`} className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${band(t.accuracy).chip}`}>
                    {t.accuracy}%
                  </span>
                  <span className="truncate">{t.name}</span>
                  <span className="text-xs text-slate-400 ml-auto shrink-0">{t.played - t.correct} missed</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 mt-3">
              {d.toRevisit ? `${d.toRevisit} question/s are waiting for another try. ` : ''}
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
                    {q.review && (
                      <Link to={q.review} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 mt-1">
                        <ListChecks size={14} /> Review answers
                      </Link>
                    )}
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
