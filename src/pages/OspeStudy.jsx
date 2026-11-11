// /ospe/study?chapter=&topic=&kind=&source=&science=&mode= — flip cards for
// picture identification. The front is the picture and "What is this?"; tap
// and the card turns over: the picture goes away and the back shows only the
// answer. Then rate it Again / Good / Easy (same Leitner boxes as
// flashcards). Answers are kept in memory and saved once at the end or when
// you leave, like FlashStudy. With mode=browse the same cards show as a
// gallery with a swipe viewer, no grading.
//
// Leaving REPLACES the history entry, as in FlashStudy, so back reaches the menu.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Images, PartyPopper, Play, RotateCw, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useData';
import { useBackHandler } from '../lib/back';
import { decideSwipe } from '../lib/swipe';
import { CHAPTERS } from '../lib/questionBrowse';
import { gradeCard } from '../lib/flashcards';
import { filterOspe, loadOspeCards, loadOspeProgress, ospeQueue, saveOspeProgress } from '../lib/ospeData';
import { OspeBack, OspePicture, OspeTile } from '../components/OspeCard';
import { AppBar, Button, Empty, ErrorBox, Page, SkeletonList, useToast } from '../components/ui';

const FLIP_MS = 500;

/**
 * One face of the study card, as in FlashStudy: both fill the same box and the
 * back starts turned away. Visibility is switched explicitly halfway through
 * the turn as well, because some Android WebViews ignore backface-visibility
 * and would show both faces at once.
 */
function Face({ children, back = false, visible, className = '' }) {
  return (
    <div
      className={`absolute inset-0 overflow-y-auto rounded-3xl border bg-white p-4 shadow-sm ${className}`}
      style={{
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transform: back ? 'rotateY(180deg)' : undefined,
        opacity: visible ? 1 : 0,
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? undefined : 'none',
      }}
      aria-hidden={!visible}
    >
      {children}
    </div>
  );
}

const RATINGS = [
  { rating: 'again', label: 'Again', cls: 'bg-rose-50 text-rose-700' },
  { rating: 'good', label: 'Good', cls: 'bg-sky-50 text-sky-700' },
  { rating: 'easy', label: 'Easy', cls: 'bg-emerald-50 text-emerald-700' },
];

/** Full-screen swipe viewer: the picture with its back info underneath. */
export function OspeViewer({ cards, at, setAt, onClose }) {
  const card = cards[at];
  const touch = useRef(null);
  useBackHandler(() => {
    onClose();
    return true;
  });
  const go = (step) => setAt((i) => Math.min(cards.length - 1, Math.max(0, i + step)));
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-slate-900 pt-safe"
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = { x: t.clientX, y: t.clientY, at: Date.now() };
      }}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const t = e.changedTouches[0];
        const swipe = decideSwipe({ dx: t.clientX - touch.current.x, dy: t.clientY - touch.current.y, dt: Date.now() - touch.current.at });
        touch.current = null;
        if (swipe === 'forward') go(1);
        if (swipe === 'back') go(-1);
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <p className="flex-1 text-sm font-semibold text-white/80">
          {at + 1} of {cards.length}
        </p>
        <button onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Close">
          <X size={24} />
        </button>
      </div>
      <div className="mx-auto min-h-0 w-full max-w-lg flex-1 overflow-y-auto px-3">
        <div className="rounded-3xl bg-white p-3 space-y-3">
          <OspePicture src={card.img} className="max-h-[50vh] w-full" />
          <OspeBack card={card} />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-lg items-center gap-2 px-3 py-3 pb-safe">
        <button onClick={() => go(-1)} disabled={at === 0} className="rounded-2xl bg-white/10 p-3 text-white disabled:opacity-30" aria-label="Previous picture">
          <ChevronLeft size={24} />
        </button>
        <p className="flex-1 text-center text-xs text-white/60">Swipe for the next one</p>
        <button onClick={() => go(1)} disabled={at === cards.length - 1} className="rounded-2xl bg-white/10 p-3 text-white disabled:opacity-30" aria-label="Next picture">
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  );
}

export default function OspeStudy() {
  const [params] = useSearchParams();
  const filters = {
    chapter: params.get('chapter') || '',
    topic: params.get('topic') || '',
    kind: params.get('kind') || '',
    source: params.get('source') || '',
    science: params.get('science') || '',
  };
  const scoped = !!(filters.chapter || filters.topic || filters.source || filters.science);
  const [browse, setBrowse] = useState(params.get('mode') === 'browse');
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const leave = useCallback(() => navigate(filters.chapter ? `/ospe/system/${encodeURIComponent(filters.chapter)}` : '/ospe', { replace: true }), [navigate, filters.chapter]);

  const data = useAsync(() => Promise.all([loadOspeCards(), loadOspeProgress(user?.uid)]).then(([cards, progress]) => ({ cards, progress })), [user?.uid]);
  const scope = useMemo(
    () => filterOspe(data.data?.cards || [], filters, CHAPTERS),
    [data.data, filters.chapter, filters.topic, filters.kind, filters.source, filters.science], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const title = filters.topic
    ? scope[0]?.topic_label || scope[0]?.title || 'Topic'
    : filters.chapter || (filters.source && filters.source.split(' › ').pop()) || filters.science || 'Study all due';

  const [queue, setQueue] = useState(null);
  const [at, setAt] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [faceShown, setFaceShown] = useState('front');
  const [graded, setGraded] = useState({});
  const [open, setOpen] = useState(null);
  const gradedRef = useRef(graded);
  gradedRef.current = graded;
  const savedRef = useRef(false);

  // Built once, so cards do not move underneath the person answering them.
  useEffect(() => {
    if (!data.data || queue || browse) return;
    setQueue(ospeQueue(scope, data.data.progress, scoped ? {} : { limit: 20, onlyDueAndNew: true }));
  }, [data.data, queue, browse, scope, scoped]);

  const persist = useCallback(async () => {
    const answers = gradedRef.current;
    if (savedRef.current || !Object.keys(answers).length || !user?.uid) return;
    savedRef.current = true;
    try {
      await saveOspeProgress(user.uid, answers);
    } catch (e) {
      savedRef.current = false;
      toast(e.message || 'Could not save your progress', 'error');
    }
  }, [user?.uid, toast]);
  useEffect(() => () => { persist(); }, [persist]);

  useBackHandler(() => {
    leave();
    return true;
  });

  const card = queue?.[at] || null;
  const finished = !!queue && queue.length > 0 && at >= queue.length;
  useEffect(() => {
    if (finished) persist();
  }, [finished, persist]);
  // A new card arrives front side up at once (waiting for the half-turn would
  // flash its answer); a flip swaps the visible face when the card is edge-on.
  useEffect(() => {
    setFlipped(false);
    setFaceShown('front');
  }, [card?._key]);
  useEffect(() => {
    const timer = setTimeout(() => setFaceShown(flipped ? 'back' : 'front'), FLIP_MS / 2);
    return () => clearTimeout(timer);
  }, [flipped]);

  const answer = (rating) => {
    if (!card) return;
    const next = gradeCard(data.data.progress[card._key] || graded[card._key], rating);
    setGraded((g) => ({ ...g, [card._key]: next }));
    // "Again": the card comes back at the end of this session.
    if (rating === 'again') setQueue((q) => [...q, card]);
    setAt((i) => i + 1);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (browse || finished || !card) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      const r = RATINGS[{ Digit1: 0, Digit2: 1, Digit3: 2 }[e.code]];
      if (flipped && r) answer(r.rating);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const header = <AppBar title={title} subtitle={browse ? 'Browse' : 'Study'} onBack={leave} />;
  if (data.loading || (!browse && !queue)) {
    return (
      <div className="min-h-screen">
        {header}
        <Page>{data.error ? <ErrorBox error={data.error} onRetry={data.reload} /> : <SkeletonList rows={3} />}</Page>
      </div>
    );
  }
  if (scope.length === 0 || (queue && queue.length === 0 && !browse)) {
    return (
      <div className="min-h-screen">
        {header}
        <Page>
          <Empty icon={<Images size={40} />} title={scope.length ? 'Nothing due right now' : 'No picture cards here yet'}>
            {scope.length ? 'Come back later, or browse the pictures.' : 'Check back soon.'}
          </Empty>
          {scope.length > 0 && (
            <Button className="mx-auto mt-3" onClick={() => setBrowse(true)}>
              <Images size={18} /> Browse
            </Button>
          )}
        </Page>
      </div>
    );
  }

  if (browse) {
    return (
      <div className="min-h-screen pb-10">
        {header}
        <Page className="space-y-3">
          <Button variant="outline" className="w-full justify-center" onClick={() => { setQueue(null); setAt(0); setBrowse(false); }}>
            <Play size={18} /> Study these {scope.length}
          </Button>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {scope.map((c, i) => (
              <OspeTile key={c._key} card={c} onClick={() => setOpen(i)} />
            ))}
          </div>
        </Page>
        {open !== null && scope[open] && <OspeViewer cards={scope} at={open} setAt={setOpen} onClose={() => setOpen(null)} />}
      </div>
    );
  }

  if (finished) {
    return (
      <div className="min-h-screen">
        {header}
        <Page className="text-center space-y-3 pt-10">
          <PartyPopper size={44} className="mx-auto text-amber-500" />
          <p className="font-display text-xl text-slate-800">Session finished</p>
          <p className="text-sm text-slate-500">{Object.keys(graded).length} cards answered.</p>
          <Button className="mx-auto" onClick={leave}>Done</Button>
        </Page>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10">
      {header}
      <Page className="space-y-3">
        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${Math.round((at / queue.length) * 100)}%` }} />
        </div>
        <p className="text-xs text-slate-500 text-right">{at + 1} of {queue.length}</p>
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? 'Show the picture' : 'Show the answer'}
          className="block h-[58vh] w-full text-left"
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
            <Face visible={faceShown === 'front'} className="border-slate-100">
              <div className="flex h-full flex-col gap-3">
                <OspePicture src={card.img} className="min-h-0 w-full flex-1" />
                <p className="text-center font-display text-lg text-slate-700">What is this?</p>
                <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                  <RotateCw size={13} /> Tap to turn the card over
                </p>
              </div>
            </Face>
            <Face back visible={faceShown === 'back'} className="border-sky-200">
              <div className="flex min-h-full flex-col justify-center gap-4">
                <OspeBack card={card} />
                <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                  <RotateCw size={13} /> Tap to see the picture again
                </p>
              </div>
            </Face>
          </div>
        </button>
        {flipped ? (
          <div className="grid grid-cols-3 gap-2">
            {RATINGS.map((r) => (
              <button key={r.rating} onClick={() => answer(r.rating)} className={`rounded-xl py-3 font-semibold ${r.cls}`}>
                {r.label}
              </button>
            ))}
          </div>
        ) : (
          <Button className="w-full justify-center" onClick={() => setFlipped(true)}>Show answer</Button>
        )}
      </Page>
    </div>
  );
}
