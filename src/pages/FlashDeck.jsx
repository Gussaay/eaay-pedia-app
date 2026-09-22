// One deck: what state its cards are in, and a short setup before studying —
// which chapters, how many cards, and what to study.
//
// The setup shows how many cards the session will actually contain before you
// start it. Choosing "50" from a chapter holding 12 should not be a surprise
// halfway through, and "nothing is due" is worth knowing before tapping Start
// rather than after.
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookOpen, Clock, History, Layers, Play, RotateCcw, Sparkles, Target, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useData';
import { getOne } from '../lib/rtdb';
import { loadCards, loadDeckProgress, resetDeckProgress } from '../lib/flashcardData';
import { buildSession, chaptersOf, deckSummary } from '../lib/flashcards';
import { clearSpot, describeSpot, loadSpot } from '../lib/resume';
import DangerConfirm from '../components/DangerConfirm';
import { AppBar, Button, Card, Empty, ErrorBox, Page, Select, SkeletonList, Thumb, useToast } from '../components/ui';

const MODES = [
  { key: 'due', label: 'Due', hint: 'What has come back round' },
  { key: 'new', label: 'New', hint: 'Cards you have not seen' },
  { key: 'weak', label: 'Weak', hint: 'What you keep missing' },
  { key: 'all', label: 'All', hint: 'Everything, in order' },
];

const SIZES = [10, 20, 50, 0]; // 0 = every card that matches
const sizeLabel = (n) => (n === 0 ? 'All' : n);

function Tile({ icon: Icon, value, label, tint }) {
  return (
    <div className="flex-1 min-w-[4.5rem] rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm">
      <Icon size={18} className={`mx-auto ${tint}`} />
      <p className="font-display text-xl mt-1 text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500 leading-tight">{label}</p>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? 'border-violet-500 bg-violet-600 text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300'
      }`}
    >
      {children}
    </button>
  );
}

export default function FlashDeck() {
  const { deckId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState('due');
  const [size, setSize] = useState(20);
  const [chapter, setChapter] = useState(''); // '' = every chapter
  // An unfinished session, if the app was closed in the middle of one.
  const [spot, setSpot] = useState(() => loadSpot('flash', deckId));

  const data = useAsync(
    () =>
      Promise.all([
        getOne(`flashdecks/${deckId}`),
        loadCards(deckId),
        loadDeckProgress(user?.uid, deckId),
      ]).then(([deck, cards, progress]) => ({ deck, cards, progress })),
    [deckId, user?.uid],
  );

  const deck = data.data?.deck;
  const cards = data.data?.cards || [];
  const progress = data.data?.progress || {};
  const summary = deckSummary(cards, progress);
  const chapters = useMemo(() => chaptersOf(cards), [cards]);
  const hasChapters = chapters.length > 1;

  // The real queue, rebuilt as the choices change, so the button can say how
  // many cards this will actually be.
  const queue = useMemo(
    () => buildSession(cards, progress, { mode, limit: size, chapters: chapter ? [chapter] : [] }),
    [cards, progress, mode, size, chapter],
  );

  const start = () => {
    if (!queue.length) return;
    const params = new URLSearchParams({ mode, limit: String(size) });
    // Still sent as the "chapters" list the session builder takes, so picking
    // several again later needs no change to the study screen.
    if (chapter) params.set('chapters', chapter);
    navigate(`/flashcards/study/${encodeURIComponent(deckId)}?${params}`);
  };

  const emptyReason =
    mode === 'weak'
      ? 'Nothing to review here yet — answer a few cards first.'
      : mode === 'new'
        ? 'You have seen every card in this selection.'
        : mode === 'due'
          ? 'Nothing is due in this selection. Try New or All.'
          : 'No cards in this selection.';

  if (data.loading) {
    return (
      <div className="min-h-screen">
        <AppBar title="Deck" />
        <Page>
          <SkeletonList />
        </Page>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="min-h-screen">
        <AppBar title="Deck" />
        <Page>
          <ErrorBox error={data.error} onRetry={data.reload} />
          <Empty icon={<Layers size={40} />} title="This deck is no longer available" />
        </Page>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      <AppBar title={deck.title} subtitle={deck.system} />
      <Page className="space-y-4">
        <Card className="p-5">
          <div className="flex items-start gap-4">
            <Thumb src={deck.img} label={deck.title} className="h-16 w-16 shrink-0 text-2xl" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl text-slate-900 leading-snug">{deck.title}</p>
              <p className="text-sm text-slate-500 mt-0.5">
                {summary.total} card{summary.total === 1 ? '' : 's'}
                {hasChapters ? ` · ${chapters.length} chapters` : ''}
              </p>
            </div>
          </div>
          {deck.about && <p className="mt-3 text-sm text-slate-600 leading-relaxed">{deck.about}</p>}

          <div className="mt-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Mastered</span>
              <span className="font-semibold text-slate-700">
                {summary.mastered} of {summary.total}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-violet-500 transition-all" style={{ width: `${summary.progress}%` }} />
            </div>
          </div>
        </Card>

        <div className="flex gap-2">
          <Tile icon={Clock} value={summary.due} label="due now" tint="text-violet-600" />
          <Tile icon={Sparkles} value={summary.new} label="not seen" tint="text-sky-600" />
          <Tile icon={BookOpen} value={summary.learning} label="learning" tint="text-amber-600" />
          <Tile
            icon={Target}
            value={summary.accuracy === null ? '—' : `${summary.accuracy}%`}
            label="accuracy"
            tint="text-emerald-600"
          />
        </div>

        {spot && summary.total > 0 && (
          <Card className="border-violet-200 bg-violet-50/60 p-4">
            <div className="flex items-start gap-3">
              <History size={20} className="mt-0.5 shrink-0 text-violet-600" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">You left a session unfinished</p>
                <p className="text-sm text-slate-600 mt-0.5">{describeSpot(spot)}</p>
              </div>
              <button
                onClick={() => {
                  clearSpot('flash', deckId);
                  setSpot(null);
                }}
                aria-label="Forget it and start fresh"
                title="Forget it"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <Button
              className="mt-3 w-full justify-center"
              onClick={() => navigate(`/flashcards/study/${encodeURIComponent(deckId)}?resume=1`)}
            >
              <Play size={18} /> Carry on
            </Button>
          </Card>
        )}

        {summary.total === 0 ? (
          <Empty icon={<Layers size={36} />} title="This deck has no cards yet" />
        ) : (
          <Card className="p-5 space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-700">What to study</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {MODES.map((m) => (
                  <Chip key={m.key} active={mode === m.key} onClick={() => setMode(m.key)}>
                    {m.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                {MODES.find((m) => m.key === mode)?.hint}
              </p>
            </div>

            {hasChapters && (
              <Select
                label="Chapter"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                hint={`${chapters.length} chapters in this deck`}
              >
                <option value="">All chapters ({summary.total} cards)</option>
                {chapters.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.total})
                  </option>
                ))}
              </Select>
            )}

            <div>
              <p className="text-sm font-semibold text-slate-700">How many cards</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SIZES.map((n) => (
                  <Chip key={n} active={size === n} onClick={() => setSize(n)}>
                    {sizeLabel(n)}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <Button className="w-full justify-center" onClick={start} disabled={!queue.length}>
                <Play size={18} />
                {queue.length
                  ? `Study ${queue.length} card${queue.length === 1 ? '' : 's'}`
                  : 'Nothing to study'}
              </Button>
              <p className="mt-2 text-center text-xs text-slate-400">
                {queue.length ? (
                  <>
                    {chapter ? `${chapter} · ` : 'Whole deck · '}
                    {size === 0 ? 'no limit' : `up to ${size}`}
                  </>
                ) : (
                  emptyReason
                )}
              </p>
            </div>
          </Card>
        )}

        {summary.total > summary.new && (
          <button
            onClick={() => setConfirmReset(true)}
            className="mx-auto flex items-center gap-2 text-sm text-slate-400 hover:text-red-600"
          >
            <RotateCcw size={15} /> Start this deck again from scratch
          </button>
        )}
      </Page>

      <DangerConfirm
        open={confirmReset}
        title="Start this deck again?"
        message={`Your progress on all ${summary.total} cards in "${deck.title}" will be cleared.`}
        impact={[
          `${summary.mastered} mastered and ${summary.learning} in-progress card${summary.learning === 1 ? '' : 's'} go back to new.`,
          'Your accuracy on this deck is reset.',
        ]}
        keeps={['Other decks, your streak and your overall totals are untouched.']}
        confirmWord="RESET"
        confirmLabel="Start again"
        busy={busy}
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await resetDeckProgress(user.uid, deckId);
            toast('Deck reset.', 'success');
            data.reload();
          } catch (e) {
            toast(e.message || 'Could not reset', 'error');
          } finally {
            setBusy(false);
            setConfirmReset(false);
          }
        }}
      />
    </div>
  );
}
