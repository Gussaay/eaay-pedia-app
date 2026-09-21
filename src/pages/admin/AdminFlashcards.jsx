// Flashcard admin: decks, and the cards inside one deck.
//
// Deleting a deck does delete its cards, unlike the MCQ catalogue — here the
// parent really does own the children (flashcard_items/<deckId>), so there is
// nothing to guess. What it leaves alone is everyone's progress, which lives
// under each user and cannot be reached from this screen.
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Layers, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useAsync, useList } from '../../hooks/useData';
import { getOne, newKey, num, updateAt, updatePaths } from '../../lib/rtdb';
import { deleteDeck, loadCards } from '../../lib/flashcardData';
import ImageField from '../../components/ImageField';
import ImportCardsModal from '../../components/ImportCardsModal';
import DangerConfirm from '../../components/DangerConfirm';
import {
  AppBar,
  Button,
  Card,
  Empty,
  ErrorBox,
  Input,
  Modal,
  Page,
  SkeletonList,
  Textarea,
  Thumb,
  Toggle,
  useToast,
} from '../../components/ui';

const BLANK_DECK = { title: '', system: '', topic: '', img: '', about: '', order: '', publish: true };
const BLANK_CARD = { front: '', back: '', hint: '', note: '', img: '', back_img: '', tags: '', topic: '' };

function RowActions({ onEdit, onDelete }) {
  return (
    <div className="flex shrink-0 gap-1">
      <button
        aria-label="Edit"
        title="Edit"
        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        <Pencil size={18} />
      </button>
      <button
        aria-label="Delete"
        title="Delete"
        className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deck list
// ---------------------------------------------------------------------------
export function FlashDecks() {
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null); // null | { ...deck, _key? }
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const decks = useList('flashdecks', {
    sort: (a, b) =>
      String(a.system || '').localeCompare(b.system || '') ||
      num(a.order) - num(b.order) ||
      String(a.title || '').localeCompare(b.title || ''),
  });

  const systems = useMemo(
    () => [...new Set(decks.data.map((d) => d.system).filter(Boolean))].sort(),
    [decks.data],
  );

  const shown = decks.data.filter((d) => {
    const needle = q.trim().toLowerCase();
    return (
      !needle ||
      String(d.title || '').toLowerCase().includes(needle) ||
      String(d.system || '').toLowerCase().includes(needle) ||
      String(d.topic || '').toLowerCase().includes(needle)
    );
  });

  const save = async () => {
    if (!form.title.trim()) return toast('A title is needed', 'error');
    if (!form.system.trim()) return toast('A system is needed — it is how decks are grouped', 'error');
    setBusy(true);
    try {
      const key = form._key || newKey('flashdecks');
      await updateAt(`flashdecks/${key}`, {
        key,
        title: form.title.trim(),
        system: form.system.trim(),
        topic: form.topic.trim(),
        img: form.img || '',
        about: form.about.trim(),
        order: num(form.order),
        publish: form.publish !== false,
        // Only set on creation: an edit must not wipe the real card count.
        ...(form._key ? {} : { count: 0, created: new Date().toISOString().slice(0, 10) }),
      });
      toast(form._key ? 'Deck updated.' : 'Deck created.', 'success');
      setForm(null);
      decks.reload();
    } catch (e) {
      toast(e.message || 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      <AppBar title="Flashcard decks" subtitle={`${decks.data.length} decks`} />
      <Page className="space-y-3">
        <ErrorBox error={decks.error} onRetry={decks.reload} />

        <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3">
          <Search size={16} className="text-slate-400" />
          <input
            className="flex-1 py-2.5 outline-none"
            placeholder="Search decks"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {decks.loading ? (
          <SkeletonList />
        ) : shown.length === 0 ? (
          <Empty icon={<Layers size={40} />} title={q ? 'No decks match' : 'No decks yet'}>
            {q ? null : 'Create a deck, then add cards to it by hand or from a spreadsheet.'}
          </Empty>
        ) : (
          shown.map((deck) => (
            <div
              key={deck._key}
              className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => navigate(`/admin/flashcards/${encodeURIComponent(deck._key)}`)}
              >
                <Thumb src={deck.img} label={deck.title} className="h-12 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 truncate">{deck.title}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {deck.system}
                    {deck.topic ? ` · ${deck.topic}` : ''} · {num(deck.count)} cards
                    {deck.publish === false ? ' · not published' : ''}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-slate-300" />
              </button>
              <RowActions
                onEdit={() => setForm({ ...BLANK_DECK, ...deck, order: String(num(deck.order) || '') })}
                onDelete={() => setConfirm(deck)}
              />
            </div>
          ))
        )}
      </Page>

      <button
        onClick={() => setForm({ ...BLANK_DECK })}
        className="fixed bottom-6 right-5 z-30 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3.5 font-semibold text-white shadow-lg"
      >
        <Plus size={20} /> New deck
      </button>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._key ? 'Edit deck' : 'New deck'}
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              Save
            </Button>
          </>
        }
      >
        {form && (
          <div>
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Congenital heart disease"
            />
            <Input
              label="System"
              value={form.system}
              onChange={(e) => setForm((f) => ({ ...f, system: e.target.value }))}
              placeholder="Cardiology"
              hint="Decks are grouped by this on the Flash Cards screen."
              list="flash-systems"
            />
            <datalist id="flash-systems">
              {systems.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <Input
              label="Topic (optional)"
              value={form.topic}
              onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
              placeholder="Cyanotic lesions"
            />
            <Textarea
              label="About (optional)"
              rows={2}
              value={form.about}
              onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))}
            />
            <ImageField label="Cover image" folder="flashcards" value={form.img} onChange={(url) => setForm((f) => ({ ...f, img: url }))} />
            <Input
              label="Order (optional)"
              type="number"
              value={form.order}
              onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
              hint="Lower numbers come first inside a system."
            />
            <Toggle
              label="Published — visible to everyone"
              checked={form.publish !== false}
              onChange={(v) => setForm((f) => ({ ...f, publish: v }))}
            />
          </div>
        )}
      </Modal>

      <DangerConfirm
        open={!!confirm}
        title={`Delete “${confirm?.title}”?`}
        message="The deck and every card in it are removed for everyone."
        impact={[`All ${num(confirm?.count)} card(s) in this deck are deleted.`]}
        keeps={[
          'Each person’s study history stays in their own account, so restoring a deck with the same cards would not bring it back into use.',
          'Other decks are untouched.',
        ]}
        confirmWord="DELETE"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await deleteDeck(confirm._key);
            toast('Deck deleted.', 'success');
            decks.reload();
          } catch (e) {
            toast(e.message || 'Could not delete', 'error');
          } finally {
            setBusy(false);
            setConfirm(null);
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cards inside one deck
// ---------------------------------------------------------------------------
export function FlashDeckCards() {
  const { deckId } = useParams();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);

  const data = useAsync(
    () =>
      Promise.all([getOne(`flashdecks/${deckId}`), loadCards(deckId)]).then(([deck, cards]) => ({
        deck,
        cards,
      })),
    [deckId],
  );

  const deck = data.data?.deck;
  const cards = data.data?.cards || [];
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? cards.filter(
        (c) =>
          String(c.front || '').toLowerCase().includes(needle) ||
          String(c.back || '').toLowerCase().includes(needle) ||
          String(c.tags || '').toLowerCase().includes(needle),
      )
    : cards;

  const saveCard = async () => {
    if (!form.front.trim()) return toast('The front of the card is empty', 'error');
    if (!form.back.trim() && !form.back_img) return toast('The back of the card is empty', 'error');
    setBusy(true);
    try {
      const key = form._key || newKey(`flashcard_items/${deckId}`);
      const updates = {
        [`flashcard_items/${deckId}/${key}`]: {
          deck: deckId,
          order: form._key ? num(form.order) : cards.length + 1,
          front: form.front.trim(),
          back: form.back.trim(),
          hint: form.hint.trim(),
          note: form.note.trim(),
          img: form.img || '',
          back_img: form.back_img || '',
          tags: form.tags.trim(),
          topic: form.topic.trim(),
        },
      };
      // The deck list shows the count without reading the cards, so it has to
      // be kept in step here.
      if (!form._key) updates[`flashdecks/${deckId}/count`] = cards.length + 1;

      await updatePaths(updates);
      toast(form._key ? 'Card updated.' : 'Card added.', 'success');
      setForm(null);
      data.reload();
    } catch (e) {
      toast(e.message || 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      <AppBar
        title={deck?.title || 'Deck'}
        subtitle={`${cards.length} card${cards.length === 1 ? '' : 's'}`}
        actions={
          <button
            onClick={() => setImporting(true)}
            className="p-2 rounded-full hover:bg-white/10"
            aria-label="Upload a set of cards"
            title="Upload a set of cards"
          >
            <Upload size={20} />
          </button>
        }
      />
      <Page className="space-y-3">
        <ErrorBox error={data.error} onRetry={data.reload} />

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 justify-center" onClick={() => setImporting(true)}>
            <Upload size={18} /> Upload a set
          </Button>
          {cards.length > 0 && (
            <Button
              variant="outline"
              className="justify-center !text-red-600 !border-red-200"
              onClick={() => setConfirm({ all: true })}
            >
              <Trash2 size={18} /> Delete all
            </Button>
          )}
        </div>

        {cards.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3">
            <Search size={16} className="text-slate-400" />
            <input
              className="flex-1 py-2.5 outline-none"
              placeholder="Search cards"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        )}

        {data.loading ? (
          <SkeletonList />
        ) : shown.length === 0 ? (
          <Empty icon={<Layers size={40} />} title={q ? 'No cards match' : 'No cards yet'}>
            {q ? null : 'Add one by hand, or upload a spreadsheet.'}
          </Empty>
        ) : (
          shown.map((card, i) => (
            <Card key={card._key} className="p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-slate-100 text-center text-xs font-bold leading-6 text-slate-500">
                  {num(card.order) || i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 line-clamp-2">{card.front}</p>
                  <p className="mt-1 text-sm text-slate-500 line-clamp-2">{card.back}</p>
                  {card.tags && <p className="mt-1.5 text-xs text-slate-400">{card.tags}</p>}
                </div>
                <RowActions
                  onEdit={() => setForm({ ...BLANK_CARD, ...card, order: num(card.order) || i + 1 })}
                  onDelete={() => setConfirm({ card })}
                />
              </div>
            </Card>
          ))
        )}
      </Page>

      <button
        onClick={() => setForm({ ...BLANK_CARD })}
        className="fixed bottom-6 right-5 z-30 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3.5 font-semibold text-white shadow-lg"
      >
        <Plus size={20} /> New card
      </button>

      {importing && (
        <ImportCardsModal
          deckId={deckId}
          existingCards={cards}
          onClose={() => setImporting(false)}
          onImported={data.reload}
        />
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        wide
        title={form?._key ? 'Edit card' : 'New card'}
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveCard} loading={busy}>
              Save
            </Button>
          </>
        }
      >
        {form && (
          <div>
            <Textarea
              label="Front (the question)"
              rows={3}
              value={form.front}
              onChange={(e) => setForm((f) => ({ ...f, front: e.target.value }))}
            />
            <Textarea
              label="Back (the answer)"
              rows={3}
              value={form.back}
              onChange={(e) => setForm((f) => ({ ...f, back: e.target.value }))}
            />
            <Input
              label="Hint (optional)"
              value={form.hint}
              onChange={(e) => setForm((f) => ({ ...f, hint: e.target.value }))}
              hint="Shown before the answer, for a nudge rather than a giveaway."
            />
            <Textarea
              label="Note (optional)"
              rows={2}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              hint="Extra detail shown under the answer."
            />
            <ImageField label="Front image" folder="flashcards" value={form.img} onChange={(url) => setForm((f) => ({ ...f, img: url }))} />
            <ImageField label="Back image" folder="flashcards" value={form.back_img} onChange={(url) => setForm((f) => ({ ...f, back_img: url }))} />
            <Input
              label="Topic (optional)"
              value={form.topic}
              onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
            />
            <Input
              label="Tags (optional)"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="croup, stridor, airway"
            />
          </div>
        )}
      </Modal>

      <DangerConfirm
        open={!!confirm}
        title={confirm?.all ? 'Delete every card in this deck?' : 'Delete this card?'}
        message={
          confirm?.all
            ? `All ${cards.length} card(s) in “${deck?.title}” will be removed for everyone.`
            : confirm?.card?.front
        }
        impact={
          confirm?.all
            ? [`${cards.length} card(s) deleted in one go.`]
            : ['This one card is removed for everyone.']
        }
        keeps={
          confirm?.all
            ? ['The deck itself stays, empty, so you can upload a new set into it.']
            : ['Every other card in the deck stays as it is.']
        }
        confirmWord="DELETE"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            if (confirm.all) {
              await updatePaths({
                [`flashcard_items/${deckId}`]: null,
                [`flashdecks/${deckId}/count`]: 0,
              });
              toast('All cards deleted.', 'success');
            } else {
              await updatePaths({
                [`flashcard_items/${deckId}/${confirm.card._key}`]: null,
                [`flashdecks/${deckId}/count`]: Math.max(0, cards.length - 1),
              });
              toast('Card deleted.', 'success');
            }
            data.reload();
          } catch (e) {
            toast(e.message || 'Could not delete', 'error');
          } finally {
            setBusy(false);
            setConfirm(null);
          }
        }}
      />
    </div>
  );
}
