// /mnemonics/gallery?book=…&deck=…&section=…&source=… — the mnemonics of a
// set laid out to browse and learn, before any testing.
//
// This is what makes mnemonics different from flashcards: a flashcard is for
// checking a fact you already know, a mnemonic first has to be looked at until
// the picture sticks. So the gallery shows every picture openly — a grid to
// scan, and a full-size viewer to swipe through — with no grading at all.
// Studying (the flip cards) comes after, from the set page.
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Lightbulb, Target, X } from 'lucide-react';
import { useAsync } from '../hooks/useData';
import { useBackHandler } from '../lib/back';
import { loadBook } from '../lib/mnemonicData';
import { filterSet, groupByHeading, sectionOf, setQuery, setTitle } from '../lib/mnemonics';
import { linksOf, refOf, testPath } from '../lib/mnemonicLinks';
import { decideSwipe } from '../lib/swipe';
import MnemonicVisual, { readVisual } from '../components/MnemonicVisual';
import ShareMnemonicButton from '../components/ShareMnemonic';
import BottomNav from '../components/BottomNav';
import { AppBar, Empty, ErrorBox, Page, SkeletonList } from '../components/ui';

export function Tile({ card, onClick }) {
  const v = readVisual(card.visual) || {};
  const tone = v.tone || '#0F7B6C';
  return (
    <button
      onClick={onClick}
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white text-left shadow-sm transition hover:shadow-md active:scale-[0.98]"
    >
      <div className="flex items-center gap-2 px-3 py-2.5 text-white" style={{ background: tone }}>
        <span className="text-2xl leading-none" aria-hidden="true">
          {v.emoji}
        </span>
        <span className="min-w-0 flex-1 text-sm font-bold leading-tight line-clamp-2">{v.title}</span>
      </div>
      <p className="flex-1 px-3 py-2 text-xs leading-snug text-slate-600 line-clamp-3">{card.front}</p>
      <p className="truncate px-3 pb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {card.topic || card.deckTitle} · {sectionOf(card)}
      </p>
    </button>
  );
}

export function Viewer({ cards, at, setAt, onClose, backTo }) {
  const navigate = useNavigate();
  const card = cards[at];
  const touch = useRef(null);
  useBackHandler(() => {
    onClose();
    return true;
  });
  const go = (step) => setAt((i) => Math.min(cards.length - 1, Math.max(0, i + step)));
  const hasTest = linksOf(card).length > 0;

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
      <p className="px-4 pb-3 text-base font-medium leading-snug text-white">{card.front}</p>
      <div className="relative mx-auto min-h-0 w-full max-w-lg flex-1 px-3">
        <div className="h-full rounded-3xl bg-white p-2">
          <MnemonicVisual visual={card.visual} source={card.source} />
        </div>
        <ShareMnemonicButton card={card} className="absolute right-6 top-3" />
      </div>
      <div className="mx-auto flex w-full max-w-lg items-center gap-2 px-3 py-3 pb-safe">
        <button
          onClick={() => go(-1)}
          disabled={at === 0}
          className="rounded-2xl bg-white/10 p-3 text-white disabled:opacity-30"
          aria-label="Previous mnemonic"
        >
          <ChevronLeft size={24} />
        </button>
        {hasTest ? (
          <button
            onClick={() => navigate(testPath([refOf(card.deck, card._key)], backTo))}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-teal-500 py-3 font-semibold text-white"
          >
            <Target size={18} /> Test yourself
          </button>
        ) : (
          <p className="flex-1 text-center text-xs text-white/60">Swipe for the next one</p>
        )}
        <button
          onClick={() => go(1)}
          disabled={at === cards.length - 1}
          className="rounded-2xl bg-white/10 p-3 text-white disabled:opacity-30"
          aria-label="Next mnemonic"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  );
}

export default function MnemonicGallery() {
  const [params] = useSearchParams();
  const filters = {
    book: params.get('book') || '',
    deck: params.get('deck') || '',
    section: params.get('section') || '',
    source: params.get('source') || '',
  };
  const [open, setOpen] = useState(null);
  const data = useAsync(() => loadBook(filters.book), [filters.book]);
  const cards = useMemo(
    () => filterSet(data.data?.cards || [], filters),
    [data.data, filters.deck, filters.section, filters.source], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const deckTitle = (data.data?.decks || []).find((d) => d._key === filters.deck)?.title || '';
  const title = setTitle({ deckTitle, section: filters.section, source: filters.source });
  const here = `/mnemonics/gallery?${setQuery(filters)}`;

  return (
    <div className="min-h-screen pb-28">
      <AppBar title={title} subtitle={`Gallery${cards.length ? ` · ${cards.length}` : ''}`} />
      <Page className="space-y-3">
        <ErrorBox error={data.error} onRetry={data.reload} />
        {data.loading ? (
          <SkeletonList />
        ) : cards.length === 0 ? (
          <Empty icon={<Lightbulb size={40} />} title="No mnemonics here yet" />
        ) : (
          <>
            <p className="text-sm text-slate-500">Look at each picture until it sticks, then test yourself from the set page.</p>
            {groupByHeading(cards, (c) => (filters.deck ? c.topic : c.deckTitle)).map((g) => (
              <section key={g.start} className="space-y-2">
                {g.heading && <h2 className="pt-2 text-sm font-bold uppercase tracking-wide text-teal-700">{g.heading}</h2>}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {g.cards.map((c, j) => (
                    <Tile key={c._key} card={c} onClick={() => setOpen(g.start + j)} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </Page>
      {open !== null && cards[open] && (
        <Viewer cards={cards} at={open} setAt={setOpen} onClose={() => setOpen(null)} backTo={here} />
      )}
      <BottomNav />
    </div>
  );
}
