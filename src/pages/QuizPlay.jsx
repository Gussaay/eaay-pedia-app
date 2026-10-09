// QuizReviewActivity: plays a quiz in "review" (instant feedback + explanation)
// or "exam" (timed, answers revealed only in the result) mode.
//
// A session is a DECK: an explicit list of positions in the loaded question
// list. A plain "start all" deck is 0..n-1, but the same machinery plays "only
// the ones I have never seen" or "only the ones I got wrong". `index` is a
// position in the deck; `deck[index]` is the question's place in the bank.
//
// The two modes differ in what may be changed once answered:
//   review — an answer is final, but you may look back over every earlier
//            question in the session, as far back as its first one
//   exam   — you may move freely and change any answer until you submit
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock, LayoutGrid, Lightbulb, MessageSquarePlus, Pencil, Send, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useBackHandler } from '../lib/back';
import { useSwipe } from '../hooks/useSwipe';
import { clearSpot, saveSpot } from '../lib/resume';
import { getOne, getWhere, num, pushTo, removeAt, str, updateAt, newKey } from '../lib/rtdb';
import {
  computeSessionResult,
  decodeAnswers,
  decodeDeck,
  encodeAnswers,
  encodeDeck,
  examDurationMs,
  formatDuration,
  historyCounts,
  isCorrect,
  planDeck,
  tallyAnswers,
  visibleOptions,
} from '../lib/quiz';
import { loadHistory, recordSession } from '../lib/quizHistory';
import { findSavedSession, invalidateQuestions, loadQuestions, loadQuizMeta, playPath } from '../lib/quizSource';
import { queuePendingResult } from '../lib/sync';
import { AppBar, Button, Card, ErrorBox, Input, Modal, Page, Spinner, Textarea, ZoomImage, useToast } from '../components/ui';
import QuestionEditModal from '../components/QuestionEditModal';
import StudyLinks from '../components/StudyLinks';

export default function QuizPlay() {
  const { kind, id } = useParams();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'exam' ? 'exam' : 'review';
  // The quiz page offers "Restore session" and "Start new" itself, so it says
  // which one it meant rather than asking the same question a second time here.
  const intent = params.get('resume') === '1' ? 'resume' : params.get('fresh') === '1' ? 'fresh' : '';
  const navigate = useNavigate();
  const toast = useToast();
  const { user, profile, isAdmin } = useAuth();
  // Stored with every bookmark: a pkey alone cannot be turned back into a URL,
  // so the home page would have no way to reopen what it is offering.
  const routes = useMemo(() => {
    const extra = Object.fromEntries(params);
    return {
      path: playPath(kind, id, 'review', { ...extra, resume: '1', fresh: '' }),
      newPath: playPath(kind, id, 'review', { ...extra, fresh: '1', resume: '' }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, params.toString()]);

  const [meta, setMeta] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [history, setHistory] = useState({});
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | resume | setup | examIntro | playing | submitting
  const [savedSession, setSavedSession] = useState(null);

  // ------------------------------------------------------------ session state
  const [deck, setDeck] = useState([]); // positions in `questions`, in play order
  const [index, setIndex] = useState(0); // position in `deck`
  const [answers, setAnswers] = useState({}); // deck position -> option key
  const [maxIndex, setMaxIndex] = useState(0); // furthest reached (review mode)
  const [floor, setFloor] = useState(0); // earliest position we may look back to
  // A session resumed from a record written before answers were stored knows
  // its totals but not the individual answers; they are added on top.
  const [baseline, setBaseline] = useState({ played: 0, correct: 0 });
  const [endAt, setEndAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  const [showExp, setShowExp] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [exitAsk, setExitAsk] = useState(false);
  const [submitAsk, setSubmitAsk] = useState(false);
  const [editing, setEditing] = useState(false);
  const submittedRef = useRef(false);

  const discardSaved = useCallback(
    async (pkey, savedRow) => {
      const row = savedRow || (await findSavedSession(user.uid, pkey).catch(() => null));
      if (row?._key) await removeAt(`resume/${row._key}`).catch(() => {});
      clearSpot('quiz', pkey);
    },
    [user.uid],
  );

  /** Picks a saved session back up, from the database row or the local copy. */
  const applyResume = (s, m = meta, qs = questions) => {
    const savedDeck = decodeDeck(s.deck);
    const positions = savedDeck.length ? savedDeck : qs.map((_, i) => i);
    const at = Math.min(Math.max(num(s.question), 0), positions.length - 1);
    setDeck(positions);
    setIndex(at);
    setMaxIndex(at);
    if (savedDeck.length) {
      // The answers came back with it, so every earlier question can be reread.
      setAnswers(decodeAnswers(s.answers));
      setFloor(0);
      setBaseline({ played: 0, correct: 0 });
    } else {
      // An older record: the totals survived but the answers did not, so
      // looking back starts where the reader picked up.
      setAnswers({});
      setFloor(at);
      setBaseline({ played: num(s.played), correct: num(s.correct_ans) });
    }
    setPhase('playing');
    discardSaved(m?.pkey, s);
  };

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
        loadHistory(user.uid, m.pkey)
          .then((h) => !cancelled && setHistory(h))
          .catch(() => {});
        if (mode === 'exam') {
          setPhase('examIntro');
          return;
        }
        if (intent === 'fresh') {
          await discardSaved(m.pkey);
          if (!cancelled) setPhase('setup');
          return;
        }
        const saved = await findSavedSession(user.uid, m.pkey);
        if (cancelled) return;
        if (!saved) {
          setPhase('setup');
          return;
        }
        setSavedSession(saved);
        // Asked for on the quiz page already: pick up without a second prompt.
        if (intent === 'resume') applyResume(saved, m, qs);
        else setPhase('resume');
      } catch (e) {
        if (!cancelled) setError(e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, mode, intent, user.uid]);

  const qi = deck[index] ?? -1;
  const current = questions[qi];
  const tq = deck.length;
  const options = useMemo(() => (current ? visibleOptions(current, meta?.source) : []), [current, meta]);
  const answer = String(current?.answer || '').trim().toLowerCase();

  // The score is counted from the answers, not accumulated as they are given:
  // exam mode lets an answer be changed, and a running total would for ever
  // remember the first tap.
  const { played, correct } = useMemo(() => {
    const t = tallyAnswers(deck, questions, answers);
    return { played: baseline.played + t.played, correct: baseline.correct + t.correct };
  }, [deck, questions, answers, baseline]);

  const chosen = answers[index] || '';
  const reveal = mode === 'review' && !!chosen;
  // Review mode locks an answer the moment it is given; exam mode never does,
  // until the paper is submitted.
  const locked = mode === 'review' && (!!chosen || index < maxIndex);
  const answeredCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);

  // ---------------------------------------------------------------- session
  const beginSession = (positions) => {
    setDeck(positions);
    setIndex(0);
    setMaxIndex(0);
    setFloor(0);
    setAnswers({});
    setBaseline({ played: 0, correct: 0 });
    setPhase('playing');
  };

  // An exam can be sat over a selection too — the clock is then set for that
  // many questions rather than for the whole bank.
  const startExam = (positions) => {
    const deckToPlay = positions?.length ? positions : questions.map((_, i) => i);
    beginSession(deckToPlay);
    setEndAt(Date.now() + examDurationMs(deckToPlay.length));
  };

  const startNew = async () => {
    await discardSaved(meta?.pkey, savedSession);
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
      const percentage = Math.trunc((final.correct / final.played) * 100);

      // Which questions were right and wrong, so the setup screen can offer
      // "only the ones I got wrong" next time, and the dashboard can show
      // where the weak topics are.
      const outcomes = {};
      const categories = {};
      Object.entries(answers).forEach(([pos, choice]) => {
        const q = questions[deck[Number(pos)]];
        if (!q || !choice) return;
        const ok = isCorrect(q, choice);
        if (q._key) outcomes[q._key] = ok ? 1 : 0;
        const cat = String(q.category || meta.chapter || '').trim() || 'Uncategorised';
        const c = (categories[cat] ||= { played: 0, correct: 0 });
        c.played += 1;
        if (ok) c.correct += 1;
      });
      recordSession({
        uid: user.uid,
        pkey: meta.pkey,
        title: meta.title,
        source: meta.source,
        outcomes,
        categories,
        played: final.played,
        correct: final.correct,
        percentage,
      }).catch(() => {});

      const goToResults = (pct, points, pending) =>
        navigate('/results', {
          replace: true,
          state: {
            title: meta.title,
            source: meta.source,
            key: meta.pkey,
            points,
            percentage: pct,
            correct: final.correct,
            played: final.played,
            mode,
            pending,
          },
        });

      // Finished without a connection: keep the result and send it later.
      const saveForLater = async (err) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [played, correct, answers, deck, questions, meta, user, profile, navigate, mode],
  );

  // ---------------------------------------------------------------- answering
  const choose = (k) => {
    if (phase !== 'playing' || !current || locked) return;
    const first = !answers[index];
    setAnswers((a) => ({ ...a, [index]: k }));
    if (mode !== 'exam') return;
    // Answering the question in front of you moves on, as it always has, but
    // changing an earlier answer leaves you where you are so you can carry on
    // checking the paper.
    if (first && index === maxIndex && index < deck.length - 1) {
      setIndex(index + 1);
      setMaxIndex(index + 1);
      window.scrollTo({ top: 0 });
    }
  };

  // ------------------------------------------------- moving between questions
  // Review mode may look back over everything it has answered in this session;
  // an exam may be walked end to end, answered or not.
  const navMin = mode === 'exam' ? 0 : floor;
  const navMax = mode === 'exam' ? deck.length - 1 : maxIndex;
  const reviewing = index < maxIndex;

  /** Jump to another question of this session without disturbing the score. */
  const goTo = (i) => {
    if (i < navMin || i > navMax || i >= deck.length) return;
    setShowExp(false);
    setIndex(i);
    // An exam may be skipped through, so the frontier is wherever you have
    // been — which is what decides whether answering moves you on.
    if (mode === 'exam') setMaxIndex((m) => Math.max(m, i));
    window.scrollTo({ top: 0 });
  };

  const goBack = () => goTo(index - 1); // goTo refuses to pass the session start

  /** Review mode: answer, then move on — the last question finishes instead. */
  const advance = () => {
    setShowExp(false);
    if (index >= deck.length - 1) {
      finish();
      return;
    }
    setIndex(index + 1);
    setMaxIndex(Math.max(maxIndex, index + 1));
    window.scrollTo({ top: 0 });
  };

  const goForward = () => {
    if (index < navMax) {
      goTo(index + 1);
      return;
    }
    if (mode === 'exam') return; // the frontier of an exam is its last question
    if (!chosen) return; // review mode only moves on once answered
    advance();
  };

  const submitExam = () => {
    if (answeredCount < deck.length) setSubmitAsk(true);
    else finish();
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
   * The deck and the answers go with it, so a restored session can be reread
   * from its first question rather than only from where it was picked up.
   *
   * Exams are left out on purpose: they are timed, and resuming one later
   * would either hand out extra time or expire the moment it reopened.
   */
  useEffect(() => {
    if (phase !== 'playing' || mode === 'exam' || !meta?.pkey || !played) return;
    saveSpot('quiz', meta.pkey, {
      // The bookmark follows the furthest question reached, not the one on
      // screen. Looking back to reread an earlier answer is not losing
      // progress, and resuming there would answer everything twice.
      question: String(answers[maxIndex] ? Math.min(maxIndex + 1, deck.length - 1) : maxIndex),
      deck: encodeDeck(deck),
      answers: encodeAnswers(answers),
      tq: String(tq),
      played: String(played),
      correct_ans: String(correct),
      done: played,
      total: tq,
      title: meta.title || '',
      path: routes.path,
      newPath: routes.newPath,
    });
  }, [phase, mode, meta, maxIndex, answers, deck, tq, played, correct, routes]);

  // ---------------------------------------------------------------- exit / save
  const saveForLater = async () => {
    const key = newKey('resume');
    await updateAt(`resume/${key}`, {
      uid: user.uid,
      key: meta.pkey,
      category: meta.chapter,
      resume_key: key,
      question: str(answers[maxIndex] ? Math.min(maxIndex + 1, deck.length - 1) : maxIndex),
      deck: encodeDeck(deck),
      answers: encodeAnswers(answers),
      points: str(correct),
      played: str(played),
      correct_ans: str(correct),
      tq: str(tq),
      title: meta.title || '',
      path: routes.path,
      newPath: routes.newPath,
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
    if (showNav) {
      setShowNav(false);
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
      if (e.target.closest('input, textarea, select') || showExp || showNav || editing || exitAsk || submitAsk) return;
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
    enabled: phase === 'playing' && !showExp && !showNav && !editing && !exitAsk && !submitAsk,
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
              <Button onClick={() => applyResume(savedSession)}>Restore session</Button>
              <Button variant="outline" onClick={startNew}>Start new</Button>
            </div>
          </Card>
        </Page>
      </>
    );

  if (phase === 'setup')
    return <SetupScreen title={title} questions={questions} history={history} onStart={beginSession} />;

  if (phase === 'examIntro')
    return <ExamIntro title={title} questions={questions} history={history} onStart={startExam} />;

  const progress = Math.round((played / Math.max(tq, 1)) * 100);

  return (
    <div className="min-h-screen pb-28" ref={deckRef}>
      <AppBar
        title={title}
        subtitle={`Question ${index + 1} of ${tq}`}
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
              <span className="rounded-full bg-brand-50 text-brand-800 px-2.5 py-1 font-semibold">Question No: {qi + 1}</span>
              {meta.source === 'smsb' || meta.bysystem ? (
                current.title && <span className="rounded-full bg-amber-50 text-amber-800 px-2.5 py-1">{current.title}</span>
              ) : null}
              {current.category && <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-1">{current.category}</span>}
              {mode === 'review' ? (
                <span className="rounded-full bg-emerald-50 text-emerald-800 px-2.5 py-1 ml-auto">Score: {correct}/{played}</span>
              ) : (
                <span className="rounded-full bg-brand-50 text-brand-800 px-2.5 py-1 ml-auto">Answered: {answeredCount}/{tq}</span>
              )}
            </div>
            {mode === 'review' && reviewing && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 text-amber-900 px-3 py-2 text-sm">
                <ArrowLeft size={16} className="shrink-0" />
                Looking back at an answered question — your answer cannot be changed. Swipe left to return to the quiz.
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
                const isAns = reveal && k === answer;
                const isWrong = reveal && k === chosen && k !== answer;
                // An exam reveals nothing, but the option you picked has to be
                // visible — both to come back to and to change.
                const isChosen = !reveal && k === chosen;
                return (
                  <button
                    key={`${index}-${k}`}
                    onClick={() => choose(k)}
                    disabled={locked}
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
            {mode === 'exam' && (
              <p className="text-center text-xs text-slate-400">
                Tap another option to change your answer at any time before you submit.
              </p>
            )}
          </>
        )}
      </Page>

      {/* Review mode: the answer bar, once this question has been answered. */}
      {mode === 'review' && chosen && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] pb-safe">
          <div className="max-w-3xl mx-auto flex gap-3 p-3">
            <div className={`hidden sm:flex items-center font-semibold ${chosen === answer ? 'text-emerald-600' : 'text-red-600'}`}>
              {chosen === answer ? 'Correct!' : `Wrong — answer is ${answer.toUpperCase()}`}
            </div>
            {index > navMin && (
              <Button variant="outline" onClick={goBack} aria-label="Previous question">
                <ArrowLeft size={18} />
              </Button>
            )}
            <Button variant="secondary" className="flex-1" onClick={() => setShowExp(true)}>
              <Lightbulb size={18} /> Explanation
            </Button>
            <Button className="flex-1" onClick={goForward}>
              {!reviewing && index >= deck.length - 1 ? 'Finish' : 'Next'} <ArrowRight size={18} />
            </Button>
          </div>
        </div>
      )}

      {/* Review mode, not yet answered: still let the reader look back. */}
      {mode === 'review' && !chosen && index > navMin && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-slate-200 pb-safe">
          <div className="max-w-3xl mx-auto flex items-center gap-3 p-3">
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft size={18} /> Previous
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setShowNav(true)}>
              <LayoutGrid size={18} /> All questions
            </Button>
          </div>
        </div>
      )}

      {/* Exam mode: free movement, and the paper is submitted when you say so. */}
      {mode === 'exam' && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] pb-safe">
          <div className="max-w-3xl mx-auto flex items-center gap-2 p-3">
            <Button variant="outline" onClick={goBack} disabled={index <= 0} aria-label="Previous question">
              <ArrowLeft size={18} />
            </Button>
            <Button variant="ghost" className="flex-1 !px-2" onClick={() => setShowNav(true)}>
              <LayoutGrid size={18} /> {answeredCount}/{tq} answered
            </Button>
            <Button variant="outline" onClick={goForward} disabled={index >= deck.length - 1} aria-label="Next question">
              <ArrowRight size={18} />
            </Button>
            <Button onClick={submitExam}>
              <Send size={16} /> Submit
            </Button>
          </div>
        </div>
      )}

      {showNav && (
        <NavigatorModal
          deck={deck}
          questions={questions}
          answers={answers}
          index={index}
          min={navMin}
          max={navMax}
          onPick={(i) => {
            setShowNav(false);
            goTo(i);
          }}
          onClose={() => setShowNav(false)}
        />
      )}

      {showExp && current && (
        <ExplanationModal
          question={current}
          quizTitle={title}
          selected={chosen}
          answer={answer}
          onClose={() => setShowExp(false)}
          onNext={goForward}
          isLast={!reviewing && index >= deck.length - 1}
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

      <Modal open={submitAsk} onClose={() => setSubmitAsk(false)} title="Submit this exam?">
        <p className="text-slate-600">
          You have answered <b>{answeredCount}</b> of <b>{tq}</b> questions. Anything left blank cannot be marked.
        </p>
        <div className="grid gap-2 mt-5">
          <Button onClick={() => { setSubmitAsk(false); finish(); }}>
            <Send size={16} /> Submit now
          </Button>
          <Button variant="outline" onClick={() => setSubmitAsk(false)}>
            <X size={16} /> Keep working
          </Button>
        </div>
      </Modal>

      {editing && current && (
        <QuestionEditModal
          question={current}
          onClose={() => setEditing(false)}
          onSaved={(patch) => {
            setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, ...patch } : q)));
            invalidateQuestions(meta);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
/**
 * The exam briefing. A quiz that has been sat before can be sat again over only
 * the questions that were never answered or the ones that were answered
 * wrongly, and the clock is set for that selection rather than for the whole
 * paper.
 */
function ExamIntro({ title, questions, history, onStart }) {
  const [err, setErr] = useState('');
  const seen = useMemo(() => historyCounts(questions, history), [questions, history]);
  const go = (m) => {
    const p = planDeck(questions, m, null, history);
    if (p.error) return setErr(p.error);
    setErr('');
    return onStart(p.deck);
  };
  return (
    <>
      <AppBar title={title} />
      <Page className="space-y-4">
        <Card className="p-6 text-center">
          <Clock className="mx-auto text-brand-600" size={48} />
          <h2 className="font-display text-xl mt-3">Exam mode</h2>
          <p className="text-slate-600 mt-2">
            This quiz contains <b>{questions.length}</b> questions. You have{' '}
            <b>{formatDuration(examDurationMs(questions.length))}</b> (30 seconds per question). You may move between
            questions and change your answers until you submit; answers are shown in your result only.
          </p>
          <Button className="w-full mt-6 !py-3" onClick={() => onStart()}>
            Start exam
          </Button>
        </Card>
        {seen.unseen < questions.length && (
          <Card className="p-5">
            <p className="font-semibold text-slate-800">Or sit a shorter paper</p>
            <div className="flex flex-wrap gap-2 text-xs mt-2 mb-4">
              <span className="rounded-full bg-emerald-50 text-emerald-800 px-2.5 py-1">{seen.right} correct</span>
              <span className="rounded-full bg-red-50 text-red-800 px-2.5 py-1">{seen.wrong} wrong</span>
              <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-1">{seen.unseen} not answered</span>
            </div>
            <div className="grid gap-3">
              <Button variant="secondary" disabled={!seen.unseen} onClick={() => go('unseen')}>
                Only questions I have not answered ({seen.unseen})
              </Button>
              <Button variant="secondary" disabled={!seen.wrong} onClick={() => go('wrong')}>
                Only questions I answered wrongly ({seen.wrong})
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              The clock is set at 30 seconds per question in whichever paper you choose.
            </p>
          </Card>
        )}
        {err && <p className="text-center text-sm text-red-600">{err}</p>}
      </Page>
    </>
  );
}

// -------------------------------------------------------------------------
/**
 * How much of the quiz to play. Beyond the slice options the app has always
 * had, a quiz that has been played before can be narrowed to the questions
 * that were never answered or the ones that were answered wrongly — which is
 * where revision time is actually worth spending.
 */
function SetupScreen({ title, questions, history, onStart }) {
  const [count, setCount] = useState('');
  const [from, setFrom] = useState('');
  const [err, setErr] = useState('');
  const total = questions.length;
  const seen = useMemo(() => historyCounts(questions, history), [questions, history]);
  const go = (m, v) => {
    const p = planDeck(questions, m, v, history);
    if (p.error) return setErr(p.error);
    setErr('');
    return onStart(p.deck);
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

        {seen.unseen < total && (
          <Card className="p-5">
            <p className="font-semibold text-slate-800">You have played this quiz before</p>
            <div className="flex flex-wrap gap-2 text-xs mt-2 mb-4">
              <span className="rounded-full bg-emerald-50 text-emerald-800 px-2.5 py-1">{seen.right} correct</span>
              <span className="rounded-full bg-red-50 text-red-800 px-2.5 py-1">{seen.wrong} wrong</span>
              <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-1">{seen.unseen} not answered</span>
            </div>
            <div className="grid gap-3">
              <Button variant="secondary" disabled={!seen.unseen} onClick={() => go('unseen')}>
                Only questions I have not answered ({seen.unseen})
              </Button>
              <Button variant="secondary" disabled={!seen.wrong} onClick={() => go('wrong')}>
                Only questions I answered wrongly ({seen.wrong})
              </Button>
            </div>
          </Card>
        )}

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
/**
 * Every question of the session as a grid, so moving back eight questions is
 * one tap rather than eight swipes. In an exam it doubles as the checklist of
 * what still has no answer.
 */
function NavigatorModal({ deck, questions, answers, index, min, max, onPick, onClose }) {
  return (
    <Modal open onClose={onClose} title="Questions in this session" footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="grid grid-cols-6 gap-2">
        {deck.map((position, i) => {
          const reachable = i >= min && i <= max;
          const answered = !!answers[i];
          const here = i === index;
          return (
            <button
              key={i}
              disabled={!reachable}
              onClick={() => onPick(i)}
              className={`h-10 rounded-xl text-sm font-semibold border-2 transition ${
                here
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : answered
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : reachable
                      ? 'border-slate-200 bg-white text-slate-700'
                      : 'border-slate-100 bg-slate-50 text-slate-300'
              }`}
              aria-label={`Question ${position + 1}${answered ? ', answered' : ''}`}
            >
              {position + 1}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 mt-4">
        Numbers are the question numbers in this quiz, and green ones have an answer
        {questions.length !== deck.length ? '. This session plays a selection of the quiz' : ''}.
      </p>
    </Modal>
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
      <StudyLinks question={question} />

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
