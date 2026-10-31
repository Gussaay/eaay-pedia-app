// Going over the answers of a finished quiz, in review or exam mode alike.
//
// Opened from the result, or any time later from the quiz page and the
// performance dashboard: every finished attempt of each quiz is kept
// (lib/quizReview.js), the newest shown first and any earlier one a pick away.
// The paper can be narrowed to the questions answered correctly, wrongly or
// left blank, and each one opens with the correct answer, the option that was
// picked and the explanation.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, CircleDashed, List, XCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useBackHandler } from '../lib/back';
import { useSwipe } from '../hooks/useSwipe';
import { filterItems, reviewCounts, reviewItems, visibleOptions } from '../lib/quiz';
import { loadAttempts } from '../lib/quizReview';
import { loadQuestions, loadQuizMeta, playPath } from '../lib/quizSource';
import { AppBar, Button, Card, ErrorBox, Page, Spinner, ZoomImage } from '../components/ui';
import StudyLinks from '../components/StudyLinks';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'correct', label: 'Correct', on: 'bg-emerald-600 text-white border-emerald-600', off: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
  { id: 'wrong', label: 'Wrong', on: 'bg-red-600 text-white border-red-600', off: 'text-red-700 border-red-200 bg-red-50' },
  { id: 'blank', label: 'Unanswered', on: 'bg-slate-600 text-white border-slate-600', off: 'text-slate-700 border-slate-200 bg-slate-50' },
];

const STATUS = {
  correct: { Icon: CheckCircle2, text: 'text-emerald-600', label: 'Correct' },
  wrong: { Icon: XCircle, text: 'text-red-600', label: 'Wrong' },
  blank: { Icon: CircleDashed, text: 'text-slate-400', label: 'Not answered' },
};

const when = (at) =>
  at ? new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

export default function QuizAnswers() {
  const { kind, id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [meta, setMeta] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [error, setError] = useState(null);

  // The filter and the attempt live in the address, so leaving and coming
  // back keeps them.
  const filter = FILTERS.some((f) => f.id === params.get('show')) ? params.get('show') : 'all';
  const attempt = attempts.find((a) => a.id === params.get('attempt')) || attempts[0] || null;
  const attemptNo = attempt ? attempts.length - attempts.indexOf(attempt) : 0;
  const [open, setOpen] = useState(-1); // position in the filtered list, -1 = list view

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const extra = Object.fromEntries(params);
        delete extra.show;
        delete extra.attempt;
        const m = await loadQuizMeta(kind, id, extra);
        const [qs, list] = await Promise.all([loadQuestions(m), loadAttempts(user.uid, m.pkey)]);
        if (cancelled) return;
        setMeta(m);
        setAttempts(list);
        setQuestions(qs);
      } catch (e) {
        if (!cancelled) setError(e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, user.uid]);

  const items = useMemo(
    () => (questions ? (attempt ? reviewItems(attempt.items, questions) : []) : null),
    [questions, attempt],
  );
  const counts = useMemo(() => reviewCounts(items || []), [items]);
  const shown = useMemo(() => filterItems(items || [], filter), [items, filter]);
  const item = open >= 0 ? shown[open] : null;

  const setParam = (name, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
    setOpen(-1);
  };
  const setFilter = (f) => setParam('show', f === 'all' ? '' : f);
  const setAttempt = (aid) => setParam('attempt', aid === attempts[0]?.id ? '' : aid);

  const step = (d) => {
    const i = open + d;
    if (i < 0 || i >= shown.length) return;
    setOpen(i);
    window.scrollTo({ top: 0 });
  };

  useBackHandler(() => {
    if (open >= 0) {
      setOpen(-1);
      return true;
    }
    return false;
  });

  useEffect(() => {
    if (open < 0) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'Escape') setOpen(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const swipeRef = useRef(null);
  useSwipe(swipeRef, { onForward: () => step(1), onBack: () => step(-1), enabled: open >= 0 });

  const title = meta?.title || 'Review answers';
  if (error)
    return (
      <>
        <AppBar title={title} />
        <Page><ErrorBox error={error} /></Page>
      </>
    );
  if (!items) return <><AppBar title={title} /><Spinner label="Loading your answers…" /></>;

  if (!attempts.length)
    return (
      <>
        <AppBar title={title} />
        <Page>
          <Card className="p-6 text-center">
            <p className="text-slate-700">There is no finished attempt of this quiz to review yet.</p>
            <p className="text-sm text-slate-500 mt-1">Finish a session in review or exam mode and its answers will be kept here.</p>
            <Button
              className="w-full mt-5"
              onClick={() => {
                const extra = Object.fromEntries(params);
                delete extra.show;
                delete extra.attempt;
                navigate(playPath(kind, id, 'review', extra));
              }}
            >
              Start the quiz
            </Button>
          </Card>
        </Page>
      </>
    );

  // ---------------------------------------------------------------- one question
  if (item) {
    const q = item.question;
    const answer = String(q.answer || '').trim().toLowerCase();
    const s = STATUS[item.status];
    const exp = String(q.exp || '').trim();
    return (
      <div className="min-h-screen pb-28" ref={swipeRef}>
        <AppBar title={title} subtitle={`Attempt #${attemptNo} · ${open + 1} of ${shown.length}${filter === 'all' ? '' : ` · ${FILTERS.find((f) => f.id === filter).label.toLowerCase()}`}`} onBack={() => setOpen(-1)} />
        <Page className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-brand-50 text-brand-800 px-2.5 py-1 font-semibold">Question No: {item.number}</span>
            {q.category && <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-1">{q.category}</span>}
            <span className={`ml-auto inline-flex items-center gap-1 font-semibold ${s.text}`}>
              <s.Icon size={16} /> {s.label}
            </span>
          </div>
          <Card className="p-5">
            <p className="text-lg text-slate-900 whitespace-pre-line leading-relaxed">{q.question}</p>
            <div data-no-swipe>
              <ZoomImage src={q.question_img} className="mt-3" />
            </div>
          </Card>
          <div className="space-y-2.5">
            {visibleOptions(q, meta?.source).map((k) => {
              const isAns = k === answer;
              const isWrong = k === item.choice && k !== answer;
              return (
                <div
                  key={k}
                  className={`flex gap-3 items-start rounded-2xl border-2 p-4 ${
                    isAns ? 'border-emerald-500 bg-emerald-50' : isWrong ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <span
                    className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-sm font-bold uppercase ${
                      isAns ? 'bg-emerald-500 text-white' : isWrong ? 'bg-red-500 text-white' : 'bg-brand-50 text-brand-700'
                    }`}
                  >
                    {k}
                  </span>
                  <span className="flex-1 text-slate-800 whitespace-pre-line">{q[k]}</span>
                  {k === item.choice && <span className="text-xs font-semibold text-slate-500 self-center">Your answer</span>}
                </div>
              );
            })}
          </div>
          <Card className="p-5">
            <p className="font-semibold text-slate-800">Explanation</p>
            <p className="text-slate-700 whitespace-pre-line mt-2 leading-relaxed">
              {exp || (q.exp_img ? 'See the explanation image below.' : 'No explanation available for this question.')}
            </p>
            <div data-no-swipe>
              <ZoomImage src={q.exp_img} credit={q.exp_img_credit} className="mt-3" />
            </div>
            <StudyLinks question={q} />
          </Card>
        </Page>
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] pb-safe">
          <div className="max-w-3xl mx-auto flex gap-3 p-3">
            <Button variant="outline" onClick={() => step(-1)} disabled={open <= 0} aria-label="Previous question">
              <ArrowLeft size={18} />
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setOpen(-1)}>
              <List size={18} /> All answers
            </Button>
            <Button variant="outline" onClick={() => step(1)} disabled={open >= shown.length - 1} aria-label="Next question">
              <ArrowRight size={18} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- the list
  const answered = counts.correct + counts.wrong;
  return (
    <>
      <AppBar title={title} subtitle="Review answers" />
      <Page className="space-y-4">
        <Card className="p-5">
          {attempts.length > 1 ? (
            <label className="block">
              <span className="text-sm text-slate-500">Attempt</span>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800"
                value={attempt?.id || ''}
                onChange={(e) => setAttempt(e.target.value)}
              >
                {attempts.map((a, i) => (
                  <option key={a.id} value={a.id}>
                    #{attempts.length - i} · {when(a.at)} · {a.mode === 'exam' ? 'Exam' : 'Review'} · {a.correct}/{a.played}
                    {i === 0 ? ' (latest)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm text-slate-500">
              Attempt #{attemptNo}{attempt?.mode === 'exam' ? ' (exam mode)' : ''}
              {attempt?.at ? ` · ${when(attempt.at)}` : ''}
            </p>
          )}
          <p className="text-2xl font-bold text-brand-700 mt-3">
            {counts.correct} / {answered} correct
            {answered ? <span className="text-base font-semibold text-slate-500"> · {Math.trunc((counts.correct / answered) * 100)}%</span> : null}
          </p>
          <div className="flex flex-wrap gap-2 mt-4" role="tablist" aria-label="Show">
            {FILTERS.filter((f) => f.id !== 'blank' || counts.blank).map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    active ? f.on || 'bg-brand-600 text-white border-brand-600' : f.off || 'text-brand-700 border-brand-200 bg-white'
                  }`}
                >
                  {f.label} ({counts[f.id]})
                </button>
              );
            })}
          </div>
        </Card>

        {shown.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-6">No questions here.</p>
        ) : (
          <Card className="divide-y divide-slate-100">
            {shown.map((it, i) => {
              const s = STATUS[it.status];
              return (
                <button
                  key={it.order}
                  onClick={() => {
                    setOpen(i);
                    window.scrollTo({ top: 0 });
                  }}
                  className="w-full text-left flex items-start gap-3 p-4 hover:bg-slate-50"
                >
                  <s.Icon size={20} className={`shrink-0 mt-0.5 ${s.text}`} aria-label={s.label} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-slate-500">Question {it.number}</span>
                    <span className="block text-slate-800 line-clamp-2">{it.question.question}</span>
                    <span className="block text-xs mt-1 text-slate-500">
                      {it.choice ? (
                        <>
                          You chose <b className="uppercase">{it.choice}</b>
                          {it.status === 'wrong' && (
                            <>
                              {' '}· answer <b className="uppercase text-emerald-700">{String(it.question.answer || '').trim()}</b>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          Not answered · answer <b className="uppercase text-emerald-700">{String(it.question.answer || '').trim()}</b>
                        </>
                      )}
                    </span>
                  </span>
                  <ArrowRight size={16} className="shrink-0 mt-1 text-slate-300" />
                </button>
              );
            })}
          </Card>
        )}
      </Page>
    </>
  );
}
