// A study session: one card at a time, reveal, rate, next.
//
// The answer is revealed below the question rather than by flipping a card
// over. Explanations here run to several lines and a two-sided flip has to
// give both faces the same height, which either crops the long side or leaves
// a lot of white space on the short one.
//
// Answers are held in memory and written once at the end — see
// lib/flashcardData.js for why that matters to the bill. Leaving early still
// saves what was answered, so nothing is lost.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Eye, Lightbulb, PartyPopper, RotateCcw, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useData';
import { getOne } from '../lib/rtdb';
import { loadCards, loadDeckProgress, loadStats, saveSession } from '../lib/flashcardData';
import { buildSession, gradeCard } from '../lib/flashcards';
import { useBackHandler } from '../lib/back';
import { AppBar, Button, Card, Empty, Page, SkeletonList, ZoomImage, useToast } from '../components/ui';

const RATING_BUTTONS = [
  { rating: 'again', label: 'Again', hint: 'Show it later today', icon: X, className: 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200' },
  { rating: 'good', label: 'Good', hint: 'I knew it', icon: Check, className: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200' },
  { rating: 'easy', label: 'Easy', hint: 'Too simple', icon: ArrowRight, className: 'bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200' },
];

export default function FlashStudy() {
  const { deckId } = useParams();
  const [params] = useSearchParams();
  const mode = params.get('mode') || 'due';
  // "|" rather than a comma, because chapter names contain commas.
  const chapters = (params.get('chapters') || '').split('|').filter(Boolean);
  const limit = params.has('limit') ? Number(params.get('limit')) : 20;
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const data = useAsync(
    () =>
      Promise.all([
        getOne(`flashdecks/${deckId}`),
        loadCards(deckId),
        loadDeckProgress(user?.uid, deckId),
        loadStats(user?.uid),
      ]).then(([deck, cards, progress, stats]) => ({ deck, cards, progress, stats })),
    [deckId, user?.uid],
  );

  const [queue, setQueue] = useState(null);
  const [at, setAt] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [graded, setGraded] = useState({});
  const [tally, setTally] = useState({ answered: 0, correct: 0 });
  const [done, setDone] = useState(false);

  // The session is built once. Rebuilding it as progress changes would make
  // cards appear and disappear underneath the person answering them.
  useEffect(() => {
    if (!data.data || queue) return;
    setQueue(
      buildSession(data.data.cards, data.data.progress, {
        mode,
        limit: Number.isFinite(limit) ? limit : 20,
        chapters,
      }),
    );
    // `chapters` is rebuilt from the query string on every render, so it is
    // deliberately not a dependency — the guard above already stops the queue
    // being replaced once it exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.data, queue, mode, limit]);

  const gradedRef = useRef(graded);
  gradedRef.current = graded;
  const tallyRef = useRef(tally);
  tallyRef.current = tally;
  const savedRef = useRef(false);

  const persist = useCallback(async () => {
    const answers = gradedRef.current;
    if (savedRef.current || !Object.keys(answers).length || !user?.uid) return;
    savedRef.current = true;
    try {
      await saveSession({
        uid: user.uid,
        deckId,
        deck: data.data?.deck,
        graded: answers,
        answered: tallyRef.current.answered,
        correct: tallyRef.current.correct,
        stats: data.data?.stats,
      });
    } catch (e) {
      savedRef.current = false;
      toast(e.message || 'Could not save your progress', 'error');
    }
  }, [user?.uid, deckId, data.data, toast]);

  // Leaving in the middle still saves. Without this, twenty answered cards
  // would be thrown away by the back button.
  useEffect(() => () => { persist(); }, [persist]);

  // Android's hardware back returns to the deck, saving on the way out
  // (the unmount effect above), rather than dropping out of the session.
  useBackHandler(() => {
    navigate(`/flashcards/deck/${encodeURIComponent(deckId)}`);
    return true;
  });

  const card = queue?.[at] || null;

  const answer = useCallback(
    (rating) => {
      if (!card) return;
      const next = gradeCard(data.data.progress[card._key] || graded[card._key], rating);
      setGraded((g) => ({ ...g, [card._key]: next }));
      setTally((t) => ({
        answered: t.answered + 1,
        correct: t.correct + (rating === 'again' ? 0 : 1),
      }));

      setQueue((q) => {
        const rest = [...q];
        // "Again" means the card goes to the back of this session, not away
        // for a day — seeing it once more now is the whole point.
        if (rating === 'again') rest.push(card);
        return rest;
      });
      setRevealed(false);
      setAt((i) => i + 1);
    },
    [card, data.data, graded],
  );

  // Whether the session is over has to be worked out during the render that
  // runs off the end of the queue, not in an effect afterwards: an effect runs
  // after the DOM is produced, so there would be one render with no card left
  // to show, and the card markup below would read `front` off null.
  //
  // It cannot be decided inside answer() either — "again" pushes the card back
  // onto the queue, so the end only exists once that has happened.
  const finished = !!queue && queue.length > 0 && at >= queue.length;

  useEffect(() => {
    if (finished && !done) {
      setDone(true);
      persist();
    }
  }, [finished, done, persist]);

  // Keyboard on the web: space reveals, 1/2/3 rate.
  useEffect(() => {
    const onKey = (e) => {
      if (done || !card) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!revealed) setRevealed(true);
        return;
      }
      if (!revealed) return;
      const index = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
      if (index !== undefined) answer(RATING_BUTTONS[index].rating);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, card, answer, done]);

  const percent = useMemo(
    () => (queue?.length ? Math.round((at / queue.length) * 100) : 0),
    [at, queue],
  );

  if (data.loading || !queue) {
    return (
      <div className="min-h-screen">
        <AppBar title="Studying" />
        <Page>
          <SkeletonList rows={3} />
        </Page>
      </div>
    );
  }

  if (!queue.length) {
    return (
      <div className="min-h-screen">
        <AppBar title="Studying" />
        <Page>
          <Empty icon={<PartyPopper size={40} />} title="Nothing to study here right now" />
          <Button
            className="mt-4 w-full justify-center"
            onClick={() => navigate(`/flashcards/deck/${encodeURIComponent(deckId)}`)}
          >
            Back to the deck
          </Button>
        </Page>
      </div>
    );
  }

  if (finished || !card) {
    const accuracy = tally.answered ? Math.round((tally.correct / tally.answered) * 100) : 0;
    return (
      <div className="min-h-screen">
        <AppBar title="Session finished" back={false} />
        <Page className="space-y-4">
          <Card className="p-6 text-center">
            <PartyPopper size={44} className="mx-auto text-violet-600" />
            <p className="font-display text-2xl mt-3 text-slate-900">Well done</p>
            <p className="text-slate-500 mt-1">
              {tally.answered} card{tally.answered === 1 ? '' : 's'} answered
            </p>
            <div className="mt-5 flex gap-3">
              <div className="flex-1 rounded-2xl bg-emerald-50 p-4">
                <p className="font-display text-2xl text-emerald-700">{tally.correct}</p>
                <p className="text-xs text-emerald-800">knew it</p>
              </div>
              <div className="flex-1 rounded-2xl bg-red-50 p-4">
                <p className="font-display text-2xl text-red-700">{tally.answered - tally.correct}</p>
                <p className="text-xs text-red-800">need another look</p>
              </div>
              <div className="flex-1 rounded-2xl bg-slate-50 p-4">
                <p className="font-display text-2xl text-slate-700">{accuracy}%</p>
                <p className="text-xs text-slate-600">this session</p>
              </div>
            </div>
          </Card>
          <Button
            className="w-full justify-center"
            onClick={() => navigate(`/flashcards/deck/${encodeURIComponent(deckId)}`)}
          >
            Back to the deck
          </Button>
          <Button
            variant="outline"
            className="w-full justify-center"
            onClick={() => navigate('/flashcards')}
          >
            All decks
          </Button>
        </Page>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-40">
      <AppBar
        title={data.data.deck?.title || 'Studying'}
        subtitle={`${Math.min(at + 1, queue.length)} of ${queue.length}`}
        onBack={() => navigate(`/flashcards/deck/${encodeURIComponent(deckId)}`)}
      />
      <div className="h-1 w-full bg-slate-200">
        <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>

      <Page className="space-y-3">
        <Card className="p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Question</p>
          <p className="mt-2 text-lg leading-relaxed text-slate-900 whitespace-pre-line">{card.front}</p>
          {card.img && <ZoomImage src={card.img} className="mt-4" />}

          {!revealed && card.hint && (
            <p className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <Lightbulb size={16} className="mt-0.5 shrink-0" /> {card.hint}
            </p>
          )}
        </Card>

        {revealed ? (
          <Card className="p-6 border-violet-200 bg-violet-50/40">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-500">Answer</p>
            <p className="mt-2 text-lg leading-relaxed text-slate-900 whitespace-pre-line">{card.back}</p>
            {card.back_img && <ZoomImage src={card.back_img} className="mt-4" />}
            {card.note && (
              <p className="mt-4 border-t border-violet-200 pt-3 text-sm leading-relaxed text-slate-600 whitespace-pre-line">
                {card.note}
              </p>
            )}
            {card.tags && <p className="mt-3 text-xs text-slate-400">{card.tags}</p>}
          </Card>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-white py-10 text-slate-500 transition hover:border-violet-400 hover:text-violet-600"
          >
            <Eye size={26} className="mx-auto" />
            <span className="mt-2 block font-semibold">Show the answer</span>
            <span className="mt-0.5 block text-xs text-slate-400">or press space</span>
          </button>
        )}
      </Page>

      {revealed && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-4 backdrop-blur pb-safe">
          <p className="mb-2 text-center text-xs text-slate-400">How well did you know it?</p>
          <div className="mx-auto flex max-w-3xl gap-2">
            {RATING_BUTTONS.map(({ rating, label, hint, icon: Icon, className }) => (
              <button
                key={rating}
                onClick={() => answer(rating)}
                className={`flex-1 rounded-2xl border py-3 font-semibold transition active:scale-95 ${className}`}
              >
                <Icon size={20} className="mx-auto" />
                <span className="mt-1 block">{label}</span>
                <span className="block text-[10px] font-normal opacity-70">{hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tally.answered > 0 && !revealed && (
        <p className="fixed inset-x-0 bottom-4 text-center text-xs text-slate-400">
          <RotateCcw size={12} className="inline" /> {tally.correct} of {tally.answered} right so far
        </p>
      )}
    </div>
  );
}
