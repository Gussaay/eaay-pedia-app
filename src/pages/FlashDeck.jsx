// One deck: what state its cards are in, and the ways to start studying it.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, BookOpen, Clock, Layers, Play, RotateCcw, Sparkles, Target } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useData';
import { getOne, num } from '../lib/rtdb';
import { loadCards, loadDeckProgress, resetDeckProgress } from '../lib/flashcardData';
import { buildSession, deckSummary } from '../lib/flashcards';
import DangerConfirm from '../components/DangerConfirm';
import { AppBar, Button, Card, Empty, ErrorBox, Page, SkeletonList, Thumb, useToast } from '../components/ui';

function Tile({ icon: Icon, value, label, tint }) {
  return (
    <div className="flex-1 min-w-[4.5rem] rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm">
      <Icon size={18} className={`mx-auto ${tint}`} />
      <p className="font-display text-xl mt-1 text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500 leading-tight">{label}</p>
    </div>
  );
}

export default function FlashDeck() {
  const { deckId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const start = (mode) => {
    const queue = buildSession(cards, progress, { mode });
    if (!queue.length) {
      toast(
        mode === 'weak'
          ? 'Nothing to review yet — answer a few cards first.'
          : mode === 'new'
            ? 'You have seen every card in this deck.'
            : 'Nothing is due right now.',
      );
      return;
    }
    navigate(`/flashcards/study/${encodeURIComponent(deckId)}?mode=${mode}`);
  };

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
                {deck.topic ? `${deck.topic} · ` : ''}
                {summary.total} card{summary.total === 1 ? '' : 's'}
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
              <div
                className="h-full bg-violet-500 transition-all"
                style={{ width: `${summary.progress}%` }}
              />
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

        {summary.total === 0 ? (
          <Empty icon={<Layers size={36} />} title="This deck has no cards yet" />
        ) : (
          <Card className="p-5 space-y-2">
            <Button className="w-full justify-center" onClick={() => start('due')}>
              <Play size={18} />
              {summary.due > 0 ? `Study ${summary.due} due card${summary.due === 1 ? '' : 's'}` : 'Start studying'}
            </Button>
            <Button variant="outline" className="w-full justify-center" onClick={() => start('new')}>
              <Sparkles size={18} /> Learn new cards ({summary.new})
            </Button>
            <Button variant="outline" className="w-full justify-center" onClick={() => start('weak')}>
              <AlertTriangle size={18} /> Review what I keep getting wrong
            </Button>
            <Button variant="outline" className="w-full justify-center" onClick={() => start('all')}>
              <Layers size={18} /> Go through the whole deck
            </Button>
            <p className="pt-1 text-center text-xs text-slate-400">
              Sessions stop after 20 cards so they always end.
            </p>
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
