// A study session: a card, tap to flip it, rate how well you knew it.
//
// The card really turns over. An earlier version put the answer underneath the
// question instead, to cope with long text, but a flashcard you can see both
// sides of at once is not a flashcard — you cannot help reading ahead, and the
// recall is what makes it work. Faces are the same fixed height and scroll
// inside if a card runs long.
//
// Leaving always REPLACES the history entry rather than pushing a new one.
// Pushing meant back went deck -> study -> deck -> study for ever and never
// reached the menu.
//
// Answers are held in memory and written once at the end — see
// lib/flashcardData.js for why that matters to the bill. Leaving early still
// saves what was answered, so nothing is lost.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Lightbulb, PartyPopper, RotateCw, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useData';
import { getOne } from '../lib/rtdb';
import { loadCards, loadDeckProgress, loadStats, saveSession } from '../lib/flashcardData';
import { buildSession, gradeCard } from '../lib/flashcards';
import { useBackHandler } from '../lib/back';
import { clearSpot, loadSpot, saveSpot } from '../lib/resume';
import { AppBar, Button, Card, Empty, Page, SkeletonList, ZoomImage, useToast } from '../components/ui';

const RATING_BUTTONS = [
  { rating: 'again', label: 'Again', hint: 'Show it later today', icon: X, className: 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200' },
  { rating: 'good', label: 'Good', hint: 'I knew it', icon: Check, className: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200' },
  { rating: 'easy', label: 'Easy', hint: 'Too simple', icon: ArrowRight, className: 'bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200' },
];

const FLIP_MS = 500;

/**
 * One face of the card. Both fill the same box; the back starts turned away.
 *
 * backface-visibility alone should hide whichever face points away, but some
 * Android WebViews ignore it and then BOTH sides are readable at once, which
 * defeats the whole thing. So visibility is also switched explicitly, halfway
 * through the turn — the moment the card is edge-on and nothing is legible.
 */
function Face({ children, back = false, visible, className = '' }) {
  return (
    <div
      className={`absolute inset-0 overflow-y-auto rounded-3xl border p-6 ${className}`}
      style={{
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transform: back ? 'rotateY(180deg)' : undefined,
        opacity: visible ? 1 : 0,
        // visibility as well as opacity: an invisible face is still in the
        // text tree, so a screen reader would otherwise read the answer out
        // while the question is showing.
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? undefined : 'none',
        // No CSS transition on these two. A transition on `visibility` does
        // not reliably settle, and the faces were left showing the wrong side
        // for good; the swap is timed in the component instead.
      }}
      aria-hidden={!visible}
    >
      {children}
    </div>
  );
}

export default function FlashStudy() {
  const { deckId } = useParams();
  const [params] = useSearchParams();
  const mode = params.get('mode') || 'due';
  // "|" rather than a comma, because chapter names contain commas.
  const chapters = (params.get('chapters') || '').split('|').filter(Boolean);
  const limit = params.has('limit') ? Number(params.get('limit')) : 20;
  const resuming = params.get('resume') === '1';
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const deckPath = `/flashcards/deck/${encodeURIComponent(deckId)}`;
  // replace, never push — see the note at the top of this file.
  const leave = useCallback((to) => navigate(to, { replace: true }), [navigate]);

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
  const [flipped, setFlipped] = useState(false);
  // Which face may be read. It changes halfway through the turn, when the card
  // is edge-on, so the two are never legible at the same time.
  const [faceShown, setFaceShown] = useState('front');
  const [graded, setGraded] = useState({});
  const [tally, setTally] = useState({ answered: 0, correct: 0 });
  const [done, setDone] = useState(false);

  // The session is built once. Rebuilding it as progress changes would make
  // cards appear and disappear underneath the person answering them.
  useEffect(() => {
    if (!data.data || queue) return;

    // Coming back to a session the app was killed in the middle of. The queue
    // is stored as card ids, so anything deleted since is simply dropped
    // rather than crashing the session.
    if (resuming) {
      const spot = loadSpot('flash', deckId);
      const byId = new Map(data.data.cards.map((c) => [c._key, c]));
      const restored = (spot?.queue || []).map((key) => byId.get(key)).filter(Boolean);
      if (restored.length) {
        setQueue(restored);
        setAt(Math.min(spot.done || 0, restored.length));
        setGraded(spot.graded || {});
        setTally(spot.tally || { answered: 0, correct: 0 });
        return;
      }
    }

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

  useBackHandler(() => {
    leave(deckPath);
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
      setAt((i) => i + 1);
    },
    [card, data.data, graded],
  );

  // A new card always arrives front side up, immediately — waiting for the
  // half-turn would flash the next card's answer for a moment.
  useEffect(() => {
    setFlipped(false);
    setFaceShown('front');
  }, [card?._key]);

  useEffect(() => {
    const timer = setTimeout(() => setFaceShown(flipped ? 'back' : 'front'), FLIP_MS / 2);
    return () => clearTimeout(timer);
  }, [flipped]);

  // Whether the session is over has to be worked out during the render that
  // runs off the end of the queue, not in an effect afterwards: an effect runs
  // after the DOM is produced, so there would be one render with no card left
  // to show, and the card markup below would read `front` off null.
  const finished = !!queue && queue.length > 0 && at >= queue.length;

  useEffect(() => {
    if (finished && !done) {
      setDone(true);
      persist();
      clearSpot('flash', deckId);
    }
  }, [finished, done, persist, deckId]);

  // Written after every answer, synchronously, so a session survives the app
  // being killed. The whole point is that it must already be saved before
  // anything gets the chance to run cleanup code.
  useEffect(() => {
    if (!queue?.length || finished) return;
    saveSpot('flash', deckId, {
      queue: queue.map((c) => c._key),
      done: at,
      graded,
      tally,
      total: queue.length,
      title: data.data?.deck?.title || '',
    });
  }, [queue, at, graded, tally, finished, deckId, data.data]);

  // Keyboard on the web: space flips, 1/2/3 rate.
  useEffect(() => {
    const onKey = (e) => {
      if (finished || !card) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      if (!flipped) return;
      const index = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
      if (index !== undefined) answer(RATING_BUTTONS[index].rating);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, card, answer, finished]);

  const percent = useMemo(
    () => (queue?.length ? Math.round((at / queue.length) * 100) : 0),
    [at, queue],
  );

  if (data.loading || !queue) {
    return (
      <div className="min-h-screen">
        <AppBar title="Studying" onBack={() => leave(deckPath)} />
        <Page>
          <SkeletonList rows={3} />
        </Page>
      </div>
    );
  }

  if (!queue.length) {
    return (
      <div className="min-h-screen">
        <AppBar title="Studying" onBack={() => leave(deckPath)} />
        <Page>
          <Empty icon={<PartyPopper size={40} />} title="Nothing to study here right now" />
          <Button className="mt-4 w-full justify-center" onClick={() => leave(deckPath)}>
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
          <Button className="w-full justify-center" onClick={() => leave(deckPath)}>
            Back to the deck
          </Button>
          <Button variant="outline" className="w-full justify-center" onClick={() => leave('/flashcards')}>
            All decks
          </Button>
        </Page>
      </div>
    );
  }

  return (
    // A fixed-height column rather than a scrolling page: the card is meant to
    // sit in the middle of the screen with the rating row under it, and nothing
    // else competing for attention. dvh so the mobile browser bar appearing
    // does not crop the card.
    <div className="flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      <AppBar
        title={data.data.deck?.title || 'Studying'}
        subtitle={`${Math.min(at + 1, queue.length)} of ${queue.length}`}
        onBack={() => leave(deckPath)}
      />
      <div className="h-1 w-full shrink-0 bg-slate-200">
        <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? 'Show the question' : 'Show the answer'}
          className="block h-full max-h-[32rem] w-full max-w-lg text-left"
          style={{ perspective: '1400px' }}
        >
          <div
            className="relative h-full"
            style={{
              transformStyle: 'preserve-3d',
              transition: `transform ${FLIP_MS}ms cubic-bezier(0.4, 0.0, 0.2, 1)`,
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            <Face visible={faceShown === 'front'} className="border-slate-200 bg-white shadow-lg">
              <div className="flex h-full flex-col">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {card.chapter || card.topic || 'Question'}
                </p>
                <div className="flex flex-1 flex-col justify-center">
                  <p className="text-xl leading-relaxed text-slate-900 whitespace-pre-line">{card.front}</p>
                  {card.img && <ZoomImage src={card.img} className="mt-4" />}
                </div>
                {card.hint && (
                  <p className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                    <Lightbulb size={16} className="mt-0.5 shrink-0" /> {card.hint}
                  </p>
                )}
                <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
                  <RotateCw size={13} /> Tap to turn the card over
                </p>
              </div>
            </Face>

            <Face back visible={faceShown === 'back'} className="border-violet-200 bg-violet-50 shadow-lg">
              <div className="flex h-full flex-col">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-500">Answer</p>
                <div className="flex flex-1 flex-col justify-center">
                  <p className="text-xl leading-relaxed text-slate-900 whitespace-pre-line">{card.back}</p>
                  {card.back_img && <ZoomImage src={card.back_img} className="mt-4" />}
                  {card.note && (
                    <p className="mt-4 border-t border-violet-200 pt-3 text-sm leading-relaxed text-slate-600 whitespace-pre-line">
                      {card.note}
                    </p>
                  )}
                </div>
                {card.tags && <p className="mt-3 text-xs text-slate-400">{card.tags}</p>}
              </div>
            </Face>
          </div>
        </button>
      </div>

      {/* In the flow rather than fixed, so it can never sit on top of the card. */}
      <div className="shrink-0 border-t border-slate-200 bg-white p-4 pb-safe">
        {flipped ? (
          <>
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
          </>
        ) : (
          // The same height either way, so the card does not jump up and down
          // as it is turned over.
          <div className="flex h-[4.9rem] flex-col items-center justify-center text-center">
            <p className="text-sm text-slate-500">Answer it in your head, then tap the card.</p>
            {tally.answered > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                {tally.correct} of {tally.answered} right so far
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
