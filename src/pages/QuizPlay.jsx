// QuizReviewActivity: plays a quiz in "review" (instant feedback + explanation)
// or "exam" (timed, answers revealed only in the result) mode.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock, Lightbulb, MessageSquarePlus, Pencil, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useBackHandler } from '../lib/back';
import { useSwipe } from '../hooks/useSwipe';
import { clearSpot, loadSpot, saveSpot } from '../lib/resume';
import { getOne, getWhere, num, pushTo, removeAt, str, updateAt, newKey } from '../lib/rtdb';
import {
  computeSessionResult,
  examDurationMs,
  formatDuration,
  isCorrect,
  planSession,
  visibleOptions,
} from '../lib/quiz';
import { invalidateQuestions, loadQuestions, loadQuizMeta } from '../lib/quizSource';
import { queuePendingResult } from '../lib/sync';
import { AppBar, Button, Card, ErrorBox, Input, Modal, Page, Spinner, Textarea, ZoomImage, useToast } from '../components/ui';
import QuestionEditModal from '../components/QuestionEditModal';

export default function QuizPlay() {
  const { kind, id } = useParams();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'exam' ? 'exam' : 'review';
  const navigate = useNavigate();
  const toast = useToast();
  const { user, profile, isAdmin } = useAuth();

  const [meta, setMeta] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | resume | setup | examIntro | playing | submitting
  const [savedSession, setSavedSession] = useState(null);

  // Session state (names follow the Android variables).
  const [index, setIndex] = useState(0); // "question": absolute position in the list
  const [tq, setTq] = useState(0); // number of questions in this session
  const [played, setPlayed] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [selected, setSelected] = useState('');
  // What was chosen for each question, so swiping back can show an earlier
  // answer without `played` and `correct` — which are running totals — being
  // counted a second time on the way forward again.
  const [answers, setAnswers] = useState({});
  const [startIndex, setStartIndex] = useState(0); // first question of this session
  const [maxIndex, setMaxIndex] = useState(0); // furthest reached, so far
  const [endAt, setEndAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  const [showExp, setShowExp] = useState(false);
  const [exitAsk, setExitAsk] = useState(false);
  const [editing, setEditing] = useState(false);
  const submittedRef = useRef(false);

  // ---------------------------------------------------------------- loading
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await loadQuizMeta(kind, id, Object.fromEntries(params));
        const qs = await loadQuestions(m);
        if (cancelled) return;
        setMeta(m);
        setQuestions(qs);
        if (!qs.length) throw new Error('This quiz has no questions yet.');
        if (mode === 'exam') {
          setPhase('examIntro');
          return;
        }
        const saved = (await getWhere('resume', 'uid', user.uid).catch(() => [])).filter((r) => r.key === m.pkey);
        if (cancelled) return;
        if (saved.length) {
          setSavedSession(saved[saved.length - 1]);
          setPhase('resume');
          return;
        }
        // Nothing saved deliberately, but the app may have been killed
        // mid-quiz. That copy lives on the phone, so it survives a crash and
        // a lost connection alike.
        const local = loadSpot('quiz', m.pkey);
        if (local) {
          setSavedSession({ ...local, local: true });
          setPhase('resume');
        } else setPhase('setup');
      } catch (e) {
        if (!cancelled) setError(e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, mode, user.uid]);

  const current = questions[index];
  const options = useMemo(() => (current ? visibleOptions(current, meta?.source) : []), [current, meta]);
  const answer = String(current?.answer || '').trim().toLowerCase();

  // ---------------------------------------------------------------- session
  const beginSession = (start, count) => {
    setIndex(start);
    setStartIndex(start);
    setMaxIndex(start);
    setAnswers({});
    setTq(count);
    setPlayed(0);
    setCorrect(0);
    setSelected('');
    setPhase('playing');
  };

  const startExam = () => {
    beginSession(0, questions.length);
    setEndAt(Date.now() + examDurationMs(questions.length));
  };

  const resume = async () => {
    const s = savedSession;
    setIndex(num(s.question));
    // A resumed session has no record of the earlier answers, so swiping back
    // starts from where the reader picked up rather than pretending it can
    // show questions answered before the app closed.
    setStartIndex(num(s.question));
    setMaxIndex(num(s.question));
    setAnswers({});
    setTq(num(s.tq));
    setPlayed(num(s.played));
    setCorrect(num(s.correct_ans));
    setSelected('');
    setPhase('playing');
    clearSpot('quiz', meta?.pkey);
    if (s._key) await removeAt(`resume/${s._key}`).catch(() => {});
  };

  const startNew = async () => {
    if (savedSession?._key) await removeAt(`resume/${savedSession._key}`).catch(() => {});
    clearSpot('quiz', meta?.pkey);
    setSavedSession(null);
    setPhase('setup');
  };

  // ---------------------------------------------------------------- finish
  const finish = useCallback(
    async (final = { played, correct }) => {
      if (submittedRef.current) return;
      if (!final.played) {
        navigate(-1);
        return;
      }
      submittedRef.current = true;
      setPhase('submitting');
      clearSpot('quiz', meta.pkey);

      const goToResults = (percentage, points, pending) =>
        navigate('/results', {
          replace: true,
          state: {
            title: meta.title,
            source: meta.source,
            key: meta.pkey,
            points,
            percentage,
            correct: final.correct,
            played: final.played,
            mode,
            pending,
          },
        });

      // Finished without a connection: keep the result and send it later.
      const saveForLater = async (err) => {
        const percentage = Math.trunc((final.correct / final.played) * 100);
        await queuePendingResult({
          uid: user.uid,
          pkey: meta.pkey,
          correct: final.correct,
          played: final.played,
          name: profile?.name || user.displayName || '',
          img: profile?.img || '',
          title: meta.title,
        }).catch(() => {});
        if (err) console.warn('[quiz] result queued for later:', err?.message || err);
        goToResults(percentage, final.correct, true);
      };

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await saveForLater();
        return;
      }

      try {
        const [u, lead] = await Promise.all([
          getOne(`quizusers/${user.uid}`),
          getOne(`quizlead/${user.uid}/${meta.pkey}`),
        ]);
        const r = computeSessionResult(final, {
          totalPlay: num(u?.total_play),
          totalCorrect: num(u?.total_correct),
          trial: num(u?.[`${meta.pkey}_trial`]),
          quizPerformance: num(u?.[meta.pkey]),
          previousPoints: num(lead),
        });
        const writes = [
          updateAt(`quizusers/${user.uid}`, {
            total_play: str(r.totalPlay),
            total_correct: str(r.totalCorrect),
            over_all: str(r.overall),
            [meta.pkey]: str(r.quizPerformance),
            [`${meta.pkey}_trial`]: str(r.trial),
          }),
        ];
        if (r.newBest) {
          writes.push(
            updateAt(`quizlead/${user.uid}`, {
              [meta.pkey]: str(r.points),
              name: profile?.name || user.displayName || '',
              img: profile?.img || '',
              uid: user.uid,
            }),
          );
        }
        await Promise.all(writes);
        goToResults(r.percentage, r.points, false);
      } catch (e) {
        // The connection died mid-save: queue instead of losing the session.
        await saveForLater(e);
      }
    },
    [played, correct, meta, user, profile, navigate, mode],
  );

  // ---------------------------------------------------------------- answering
  const choose = (k) => {
    // `answers[index]` blocks a second attempt in exam mode, where nothing is
    // ever put in `selected`; `selected` blocks it in review mode.
    if (phase !== 'playing' || selected || answers[index]) return;
    const ok = isCorrect(current, k);
    const nextPlayed = played + 1;
    const nextCorrect = correct + (ok ? 1 : 0);
    setPlayed(nextPlayed);
    setCorrect(nextCorrect);
    setAnswers((a) => ({ ...a, [index]: k }));
    if (mode === 'exam') {
      if (nextPlayed >= tq) finish({ played: nextPlayed, correct: nextCorrect });
      else {
        setIndex((i) => i + 1);
        setMaxIndex((m) => Math.max(m, index + 1));
      }
    } else {
      setSelected(k);
    }
  };

  const next = () => {
    setShowExp(false);
    if (played >= tq) {
      finish();
      return;
    }
    setSelected('');
    setIndex((i) => i + 1);
    setMaxIndex((m) => Math.max(m, index + 1));
    window.scrollTo({ top: 0 });
  };

  // ------------------------------------------------- moving between questions
  const reviewing = index < maxIndex;

  /** Jump to an already-visited question without touching the running totals. */
  const goTo = (i) => {
    if (i < startIndex || i > maxIndex || i >= questions.length) return;
    setShowExp(false);
    setIndex(i);
    setSelected(mode === 'review' ? answers[i] || '' : '');
    window.scrollTo({ top: 0 });
  };

  const goBack = () => goTo(index - 1); // goTo refuses to pass the session start

  /**
   * Forward means "the next question" while looking back over earlier ones, and
   * "advance the quiz" at the frontier — where it still needs an answer first,
   * exactly as the Next button does.
   *
   * The answer check uses `answers`, not `selected`, because exam mode never
   * fills `selected`. Testing `selected` would let a swipe skip an unanswered
   * exam question without counting it, and the session would then run off the
   * end of the list rather than finishing.
   */
  const goForward = () => {
    if (reviewing) {
      goTo(index + 1);
      return;
    }
    if (!answers[index]) return;
    next();
  };

  // ---------------------------------------------------------------- timer
  useEffect(() => {
    if (mode !== 'exam' || phase !== 'playing' || !endAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [mode, phase, endAt]);
  const remaining = endAt ? endAt - now : 0;
  useEffect(() => {
    if (mode === 'exam' && phase === 'playing' && endAt && remaining <= 0) {
      toast("Time's up!", 'info');
      finish();
    }
  }, [remaining, mode, phase, endAt, finish, toast]);

  /**
   * Keeps a bookmark on the phone while a quiz is in progress.
   *
   * "Save for later" writes to the database, but only when the user taps it on
   * the way out. An app that is swiped away or killed for memory never gets
   * that chance, and the whole session was lost. This runs after every answer
   * and is synchronous, so the last position is already stored.
   *
   * Exams are left out on purpose: they are timed, and resuming one later
   * would either hand out extra time or expire the moment it reopened.
   */
  useEffect(() => {
    if (phase !== 'playing' || mode === 'exam' || !meta?.pkey || !played) return;
    saveSpot('quiz', meta.pkey, {
      // The bookmark follows the furthest question reached, not the one on
      // screen. Swiping back to reread an earlier answer is not losing progress,
      // and resuming there would make the reader answer everything twice.
      question: String(answers[maxIndex] ? maxIndex + 1 : maxIndex),
      tq: String(tq),
      played: String(played),
      correct_ans: String(correct),
      done: played,
      total: tq,
      title: meta.title || '',
    });
  }, [phase, mode, meta, maxIndex, answers, tq, played, correct]);

  // ---------------------------------------------------------------- exit / save
  const saveForLater = async () => {
    const key = newKey('resume');
    await updateAt(`resume/${key}`, {
      uid: user.uid,
      key: meta.pkey,
      category: meta.chapter,
      resume_key: key,
      question: str(answers[maxIndex] ? maxIndex + 1 : maxIndex),
      points: str(correct),
      played: str(played),
      correct_ans: str(correct),
      tq: str(tq),
    });
    clearSpot('quiz', meta.pkey); // it is in the database now
    toast('Progress saved', 'success');
    navigate(-1);
  };

  const requestExit = () => {
    if (phase === 'playing' && played > 0) setExitAsk(true);
    else navigate(-1);
  };
  useBackHandler(() => {
    if (showExp) {
      setShowExp(false);
      return true;
    }
    if (phase === 'playing' && played > 0) {
      setExitAsk(true);
      return true;
    }
    return false;
  });

  // Keyboard shortcuts on desktop: 1-5 / a-e to answer, Enter or → for next,
  // ← to look back. The arrow keys mirror the swipe gestures on a phone.
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select') || showExp || editing || exitAsk) return;
      const k = e.key.toLowerCase();
      const byNum = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e' }[k];
      const opt = byNum || (options.includes(k) ? k : null);
      if (opt && options.includes(opt)) choose(opt);
      else if (k === 'arrowleft') goBack();
      else if (k === 'arrowright' || k === 'enter') goForward();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Swipe left for the next question, right to look back at the last one.
  const deckRef = useRef(null);
  useSwipe(deckRef, {
    onForward: goForward,
    onBack: goBack,
    enabled: phase === 'playing' && !showExp && !editing && !exitAsk,
  });

  // ---------------------------------------------------------------- render
  const title = meta?.title || 'Quiz';
  if (error)
    return (
      <>
        <AppBar title={title} />
        <Page><ErrorBox error={error} /></Page>
      </>
    );
  if (phase === 'loading' || !meta) return <><AppBar title={title} /><Spinner label="Loading questions…" /></>;
  if (phase === 'submitting') return <><AppBar title={title} back={false} /><Spinner label="Saving your result…" /></>;

  if (phase === 'resume')
    return (
      <>
        <AppBar title={title} />
        <Page>
          <Card className="p-6 text-center">
            <img src="/img/happy.png" alt="" className="h-24 mx-auto" />
            <p className="text-slate-700 mt-4">
              In the previous session you solved <b>{savedSession.played}</b> out of <b>{savedSession.tq}</b> questions.
            </p>
            <div className="grid gap-3 mt-6">
              <Button onClick={resume}>Resume</Button>
              <Button variant="outline" onClick={startNew}>Start new</Button>
            </div>
          </Card>
        </Page>
      </>
    );

  if (phase === 'setup') return <SetupScreen title={title} total={questions.length} onStart={beginSession} />;

  if (phase === 'examIntro')
    return (
      <>
        <AppBar title={title} />
        <Page>
          <Card className="p-6 text-center">
            <Clock className="mx-auto text-brand-600" size={48} />
            <h2 className="font-display text-xl mt-3">Exam mode</h2>
            <p className="text-slate-600 mt-2">
              This quiz contains <b>{questions.length}</b> questions. You have{' '}
              <b>{formatDuration(examDurationMs(questions.length))}</b> (30 seconds per question). Answers are shown
              in your result only.
            </p>
            <Button className="w-full mt-6 !py-3" onClick={startExam}>
              Start exam
            </Button>
          </Card>
        </Page>
      </>
    );

  const progress = Math.round((played / Math.max(tq, 1)) * 100);

  return (
    <div className="min-h-screen pb-28" ref={deckRef}>
      <AppBar
        title={title}
        subtitle={`Question ${Math.min(played + (selected ? 0 : 1), tq)} of ${tq}`}
        onBack={requestExit}
        actions={
          <>
            {mode === 'exam' && (
              <span className={`flex items-center gap-1 font-mono text-sm px-2 py-1 rounded-lg ${remaining < 60000 ? 'bg-red-500' : 'bg-white/15'}`}>
                <Clock size={16} /> {formatDuration(remaining)}
              </span>
            )}
            {isAdmin && (
              <button className="p-2 rounded-full hover:bg-white/10" aria-label="Edit question" onClick={() => setEditing(true)}>
                <Pencil size={20} />
              </button>
            )}
          </>
        }
      />
      <div className="h-1 bg-brand-100">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <Page className="space-y-4">
        {current && (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-brand-50 text-brand-800 px-2.5 py-1 font-semibold">Question No: {index + 1}</span>
              {meta.source === 'smsb' || meta.bysystem ? (
                current.title && <span className="rounded-full bg-amber-50 text-amber-800 px-2.5 py-1">{current.title}</span>
              ) : null}
              {current.category && <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-1">{current.category}</span>}
              {mode === 'review' && (
                <span className="rounded-full bg-emerald-50 text-emerald-800 px-2.5 py-1 ml-auto">Score: {correct}/{played}</span>
              )}
            </div>
            {reviewing && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 text-amber-900 px-3 py-2 text-sm">
                <ArrowLeft size={16} className="shrink-0" />
                Looking back at an answered question — swipe left to return to the quiz.
              </div>
            )}
            <Card className="p-5">
              <p className="text-lg text-slate-900 whitespace-pre-line leading-relaxed">{current.question}</p>
              <div data-no-swipe>
                <ZoomImage src={current.question_img} className="mt-3" />
              </div>
            </Card>
            <div className="space-y-2.5">
              {options.map((k) => {
                const reveal = mode === 'review' && !!selected;
                const isAns = reveal && k === answer;
                const isWrong = reveal && k === selected && k !== answer;
                // In an exam nothing is revealed, but a reader swiping back
                // still needs to see which option they picked.
                const isChosen = !reveal && k === answers[index];
                return (
                  <button
                    key={`${index}-${k}`}
                    onClick={() => choose(k)}
                    disabled={!!selected || !!answers[index]}
                    className={`w-full text-left flex gap-3 items-start rounded-2xl border-2 p-4 transition active:scale-[0.99] ${
                      isAns
                        ? 'border-emerald-500 bg-emerald-50'
                        : isWrong
                          ? 'border-red-500 bg-red-50'
                          : isChosen
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-slate-200 bg-white hover:border-brand-400'
                    }`}
                  >
                    <span
                      className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-sm font-bold uppercase ${
                        isAns
                          ? 'bg-emerald-500 text-white'
                          : isWrong
                            ? 'bg-red-500 text-white'
                            : isChosen
                              ? 'bg-brand-500 text-white'
                              : 'bg-brand-50 text-brand-700'
                      }`}
                    >
                      {k}
                    </span>
                    <span className="flex-1 text-slate-800 whitespace-pre-line">{current[k]}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Page>

      {mode === 'review' && selected && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] pb-safe">
          <div className="max-w-3xl mx-auto flex gap-3 p-3">
            <div className={`hidden sm:flex items-center font-semibold ${selected === answer ? 'text-emerald-600' : 'text-red-600'}`}>
              {selected === answer ? 'Correct!' : `Wrong — answer is ${answer.toUpperCase()}`}
            </div>
            {index > startIndex && (
              <Button variant="outline" onClick={goBack} aria-label="Previous question">
                <ArrowLeft size={18} />
              </Button>
            )}
            <Button variant="secondary" className="flex-1" onClick={() => setShowExp(true)}>
              <Lightbulb size={18} /> Explanation
            </Button>
            <Button className="flex-1" onClick={goForward}>
              {!reviewing && played >= tq ? 'Finish' : 'Next'} <ArrowRight size={18} />
            </Button>
          </div>
        </div>
      )}

      {showExp && current && (
        <ExplanationModal
          question={current}
          quizTitle={title}
          selected={selected}
          answer={answer}
          onClose={() => setShowExp(false)}
          onNext={goForward}
          isLast={!reviewing && played >= tq}
        />
      )}

      <Modal open={exitAsk} onClose={() => setExitAsk(false)} title="Leave quiz?">
        <p className="text-slate-600">
          You answered {played} of {tq} questions.
        </p>
        <div className="grid gap-2 mt-5">
          <Button onClick={() => { setExitAsk(false); finish(); }}>Exit and submit results</Button>
          {mode === 'review' && (
            <Button variant="secondary" onClick={() => { setExitAsk(false); saveForLater(); }}>
              Save for later
            </Button>
          )}
          <Button variant="outline" onClick={() => setExitAsk(false)}>
            <X size={16} /> Continue quiz
          </Button>
        </div>
      </Modal>

      {editing && current && (
        <QuestionEditModal
          question={current}
          onClose={() => setEditing(false)}
          onSaved={(patch) => {
            setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
            invalidateQuestions(meta);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
function SetupScreen({ title, total, onStart }) {
  const [count, setCount] = useState('');
  const [from, setFrom] = useState('');
  const [err, setErr] = useState('');
  const go = (m, v) => {
    const p = planSession(total, m, v);
    if (p.error) return setErr(p.error);
    onStart(p.start, p.count);
  };
  return (
    <>
      <AppBar title={title} />
      <Page className="space-y-4">
        <Card className="p-5 text-center">
          <p className="text-slate-600">This quiz contains</p>
          <p className="text-4xl font-bold text-brand-700 my-1">{total}</p>
          <p className="text-slate-600">questions</p>
          <Button className="w-full mt-5 !py-3" onClick={() => go('all')}>
            Start all questions
          </Button>
        </Card>
        <Card className="p-5">
          <form onSubmit={(e) => { e.preventDefault(); go('count', count); }}>
            <Input label="Choose number of questions" type="number" min="1" inputMode="numeric" placeholder={`1 – ${total}`} value={count} onChange={(e) => setCount(e.target.value)} />
            <Button type="submit" variant="secondary" className="w-full">Start</Button>
          </form>
        </Card>
        <Card className="p-5">
          <form onSubmit={(e) => { e.preventDefault(); go('from', from); }}>
            <Input label="Start from question number" type="number" min="1" inputMode="numeric" placeholder={`1 – ${total}`} value={from} onChange={(e) => setFrom(e.target.value)} />
            <Button type="submit" variant="secondary" className="w-full">Start</Button>
          </form>
        </Card>
        {err && <p className="text-center text-sm text-red-600">{err}</p>}
      </Page>
    </>
  );
}

// -------------------------------------------------------------------------
function ExplanationModal({ question, quizTitle, selected, answer, onClose, onNext, isLast }) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [comments, setComments] = useState(null);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    getWhere('feedback', 'key', question._key)
      .then((list) => setComments(list.filter((f) => f.comment)))
      .catch(() => setComments([]));
  }, [question._key]);

  const submit = async () => {
    if (!text.trim()) return;
    await pushTo('feedback', {
      comment: text.trim(),
      name: profile?.name || user.displayName || '',
      key: question._key,
      title: question.title || quizTitle,
      uid: user.uid,
    });
    toast('Comment submitted, thanks for your contribution.', 'success');
    setComments((c) => [...(c || []), { _key: 'new', comment: text.trim(), name: profile?.name }]);
    setText('');
    setWriting(false);
  };

  const exp = String(question.exp || '').trim();
  const right = selected === answer;

  return (
    <Modal
      open
      onClose={onClose}
      title="Explanation"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={onNext}>{isLast ? 'Finish' : 'Next question'} <ArrowRight size={16} /></Button>
        </>
      }
    >
      <div className={`rounded-xl p-3 ${right ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
        <p className="font-semibold">{right ? 'Your answer is correct' : 'Your answer is wrong, correct answer is:'}</p>
        <p className="mt-1">
          <b className="uppercase">{answer}.</b> {question[answer]}
        </p>
      </div>
      <p className="text-slate-700 whitespace-pre-line mt-4 leading-relaxed">
        {exp ||
          (question.exp_img
            ? 'See the explanation image below.'
            : 'No explanation available, you can add your own by submitting your comments below.')}
      </p>
      <ZoomImage src={question.exp_img} className="mt-3" />

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-sm font-semibold text-slate-700 mb-2">Comments</p>
        {comments === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-slate-400">No comments yet.</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((c) => (
              <li key={c._key} className="text-sm bg-slate-50 rounded-lg p-2">
                {c.name && <b className="text-slate-700">{c.name}: </b>}
                {c.comment}
              </li>
            ))}
          </ul>
        )}
        {writing ? (
          <div className="mt-3">
            <Textarea placeholder="Enter your comments" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setWriting(false)}>Cancel</Button>
              <Button onClick={submit} disabled={!text.trim()}>Submit</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="mt-2 !px-0" onClick={() => setWriting(true)}>
            <MessageSquarePlus size={18} /> Add a comment
          </Button>
        )}
      </div>
    </Modal>
  );
}
