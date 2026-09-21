// Flashcard admin, laid out the same way as the MCQ catalogue:
//
//   flashcategory  ->  flashbooks  ->  flashdecks  ->  flashcard_items
//   (category)         (book)          (deck)          (cards)
//
// It is a separate tree from the MCQ one, so flashcards can be organised
// however suits them without disturbing the question banks.
//
// Levels are linked by a "source" string, exactly as the MCQ side does — which
// is why deleting a category or a book does NOT delete what sits under it: the
// link is a name, not a parent id, so a cascade would have to guess. The
// dialogs say what is left behind, and renaming a source has the same effect.
//
// A deck also carries a `system` (Cardiology, Neurology…). That is a different
// axis from the book hierarchy — it is what the progress and gaps screen
// groups by, the same way MCQ questions carry category1 alongside their book.
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Layers, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useAsync, useList } from '../../hooks/useData';
import { getOne, newKey, num, pushTo, removeAt, updateAt, updatePaths } from '../../lib/rtdb';
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
  ListCard,
  Modal,
  Page,
  SkeletonList,
  Textarea,
  Toggle,
  useToast,
} from '../../components/ui';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const isPublished = (x) => String(x?.publish) !== 'false';

function RowActions({ onEdit, onDelete }) {
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={stop(onEdit)} aria-label="Edit" className="p-2 rounded-lg text-slate-400 hover:text-brand-700 hover:bg-brand-50">
        <Pencil size={18} />
      </button>
      <button onClick={stop(onDelete)} aria-label="Delete" className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
        <Trash2 size={18} />
      </button>
    </div>
  );
}

function AddButton({ onClick, children }) {
  return (
    <Button className="w-full" onClick={onClick}>
      <Plus size={18} /> {children}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Level 1: categories
// ---------------------------------------------------------------------------
export function FlashCategories() {
  const navigate = useNavigate();
  const toast = useToast();
  const list = useList('flashcategory');
  const books = useList('flashbooks');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const booksUnder = (source) => books.data.filter((b) => b.main_category === source).length;

  const save = async () => {
    if (!form.source.trim()) return toast('Enter a source', 'error');
    if (!form.title.trim()) return toast('Enter a title', 'error');
    setBusy(true);
    try {
      const record = {
        title: form.title.trim(),
        source: form.source.trim(),
        img: form.img || '',
        publish: form.publish,
      };
      if (form._key) await updateAt(`flashcategory/${form._key}`, record);
      else await pushTo('flashcategory', record);
      toast(form._key ? 'Category saved' : 'Category added', 'success');
      setForm(null);
      list.reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppBar title="Flashcards" subtitle="Categories — tap one to open its books" />
      <Page className="space-y-3">
        <ErrorBox error={list.error} onRetry={list.reload} />
        <AddButton onClick={() => setForm({ title: '', source: '', img: '', publish: true })}>
          Add new category
        </AddButton>

        {list.loading ? (
          <SkeletonList />
        ) : list.data.length === 0 ? (
          <Empty icon={<Layers size={40} />} title="No flashcard categories yet">
            Add a category, then a book inside it, then the decks.
          </Empty>
        ) : (
          list.data.map((c) => (
            <ListCard
              key={c._key}
              img={c.img}
              title={c.title}
              subtitle={`source: ${c.source} · ${plural(booksUnder(c.source), 'book')}${isPublished(c) ? '' : ' · hidden'}`}
              onClick={() =>
                navigate(
                  `/admin/flashcards/category/${encodeURIComponent(c.source)}?title=${encodeURIComponent(c.title || '')}`,
                )
              }
              right={
                <RowActions
                  onEdit={() =>
                    setForm({
                      _key: c._key,
                      title: c.title || '',
                      source: c.source || '',
                      img: c.img || '',
                      publish: isPublished(c),
                    })
                  }
                  onDelete={() => setConfirm(c)}
                />
              }
            />
          ))
        )}
      </Page>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._key ? 'Edit category' : 'New category'}
        footer={
          <Button onClick={save} loading={busy}>
            {form?._key ? 'Save' : 'Add'}
          </Button>
        }
      >
        {form && (
          <>
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Nelson essentials"
            />
            <Input
              label="Source"
              hint={
                form._key
                  ? 'Books are matched to this category by source — changing it hides the books already under it.'
                  : 'Books are matched to this category by source.'
              }
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
            <ImageField folder="flashcards" value={form.img} onChange={(img) => setForm({ ...form, img })} />
            <Toggle
              label="Published — visible to everyone"
              checked={form.publish}
              onChange={(publish) => setForm({ ...form, publish })}
            />
          </>
        )}
      </Modal>

      <DangerConfirm
        open={!!confirm}
        busy={busy}
        title="Delete category?"
        message={`"${confirm?.title}" will be removed for every user.`}
        impact={['The category disappears from the app immediately']}
        keeps={
          confirm && booksUnder(confirm.source) > 0
            ? [
                `Its ${plural(booksUnder(confirm.source), 'book')} and their decks stay in the database but become unreachable — open the category and delete them first if you want them gone`,
              ]
            : []
        }
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await removeAt(`flashcategory/${confirm._key}`);
            toast('Category deleted', 'success');
            setConfirm(null);
            list.reload();
          } catch (e) {
            toast(e.message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Level 2: books inside a category
// ---------------------------------------------------------------------------
export function FlashCategoryBooks() {
  const { source } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const list = useList('flashbooks', { filter: (b) => b.main_category === source });
  const decks = useList('flashdecks');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const decksUnder = (b) => decks.data.filter((d) => d.source === b.source).length;

  const save = async () => {
    if (!form.source.trim()) return toast('Enter a source', 'error');
    if (!form.title.trim()) return toast('Enter a title', 'error');
    setBusy(true);
    try {
      const record = {
        title: form.title.trim(),
        source: form.source.trim(),
        img: form.img || '',
        publish: form.publish,
        // Needed so the book shows under its category.
        main_category: source,
      };
      if (form._key) await updateAt(`flashbooks/${form._key}`, record);
      else await pushTo('flashbooks', record);
      toast(form._key ? 'Book saved' : 'Book added', 'success');
      setForm(null);
      list.reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppBar title={params.get('title') || source} subtitle="Books — tap one to open its decks" />
      <Page className="space-y-3">
        <AddButton onClick={() => setForm({ title: '', source: '', img: '', publish: true })}>
          Add new book
        </AddButton>

        {list.loading ? (
          <SkeletonList />
        ) : list.data.length === 0 ? (
          <Empty title="No books in this category yet" />
        ) : (
          list.data.map((b) => (
            <ListCard
              key={b._key}
              img={b.img}
              title={b.title}
              subtitle={`source: ${b.source} · ${plural(decksUnder(b), 'deck')}${isPublished(b) ? '' : ' · hidden'}`}
              onClick={() =>
                navigate(
                  `/admin/flashcards/book/${encodeURIComponent(b.source)}?title=${encodeURIComponent(b.title || '')}`,
                )
              }
              right={
                <RowActions
                  onEdit={() =>
                    setForm({
                      _key: b._key,
                      title: b.title || '',
                      source: b.source || '',
                      img: b.img || '',
                      publish: isPublished(b),
                    })
                  }
                  onDelete={() => setConfirm(b)}
                />
              }
            />
          ))
        )}
      </Page>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._key ? 'Edit book' : 'New book'}
        footer={
          <Button onClick={save} loading={busy}>
            {form?._key ? 'Save' : 'Add'}
          </Button>
        }
      >
        {form && (
          <>
            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input
              label="Source"
              hint={
                form._key
                  ? 'Decks are matched to this book by source — changing it hides the decks already under it.'
                  : 'Decks are matched to this book by source.'
              }
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
            <ImageField folder="flashcards" value={form.img} onChange={(img) => setForm({ ...form, img })} />
            <Toggle
              label="Published — visible to everyone"
              checked={form.publish}
              onChange={(publish) => setForm({ ...form, publish })}
            />
          </>
        )}
      </Modal>

      <DangerConfirm
        open={!!confirm}
        busy={busy}
        title="Delete book?"
        message={`"${confirm?.title}" will be removed from this category for every user.`}
        impact={['The book disappears from the app immediately']}
        keeps={
          confirm && decksUnder(confirm) > 0
            ? [
                `Its ${plural(decksUnder(confirm), 'deck')} and their cards stay in the database but become unreachable — open the book and delete them first if you want them gone`,
              ]
            : []
        }
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await removeAt(`flashbooks/${confirm._key}`);
            toast('Book deleted', 'success');
            setConfirm(null);
            list.reload();
          } catch (e) {
            toast(e.message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Level 3: decks inside a book
// ---------------------------------------------------------------------------
const BLANK_DECK = { title: '', system: '', topic: '', img: '', about: '', order: '', publish: true };

export function FlashBookDecks() {
  const { source } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const list = useList('flashdecks', {
    filter: (d) => d.source === source,
    sort: (a, b) => num(a.order) - num(b.order) || String(a.title || '').localeCompare(b.title || ''),
  });
  const allDecks = useList('flashdecks');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  // Offered in the System box, so the same spelling is reused rather than
  // "Cardiology" and "cardiology" splitting one system into two on the gaps
  // screen.
  const systems = useMemo(
    () => [...new Set(allDecks.data.map((d) => d.system).filter(Boolean))].sort(),
    [allDecks.data],
  );

  const save = async () => {
    if (!form.title.trim()) return toast('Enter a title', 'error');
    if (!form.system.trim()) return toast('Enter a system — the progress screen groups by it', 'error');
    setBusy(true);
    try {
      const key = form._key || newKey('flashdecks');
      await updateAt(`flashdecks/${key}`, {
        key,
        source,
        title: form.title.trim(),
        system: form.system.trim(),
        topic: form.topic.trim(),
        img: form.img || '',
        about: form.about.trim(),
        order: num(form.order),
        publish: form.publish !== false,
        // Only on creation: an edit must not wipe the real card count.
        ...(form._key ? {} : { count: 0, created: new Date().toISOString().slice(0, 10) }),
      });
      toast(form._key ? 'Deck saved' : 'Deck added', 'success');
      setForm(null);
      list.reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppBar title={params.get('title') || source} subtitle="Decks — tap one to open its cards" />
      <Page className="space-y-3">
        <AddButton onClick={() => setForm({ ...BLANK_DECK })}>Add new deck</AddButton>

        {list.loading ? (
          <SkeletonList />
        ) : list.data.length === 0 ? (
          <Empty icon={<Layers size={40} />} title="No decks in this book yet" />
        ) : (
          list.data.map((d) => (
            <ListCard
              key={d._key}
              img={d.img}
              title={d.title}
              subtitle={`${d.system}${d.topic ? ` · ${d.topic}` : ''} · ${plural(num(d.count), 'card')}${isPublished(d) ? '' : ' · hidden'}`}
              onClick={() => navigate(`/admin/flashcards/deck/${encodeURIComponent(d._key)}`)}
              right={
                <RowActions
                  onEdit={() =>
                    setForm({ ...BLANK_DECK, ...d, order: String(num(d.order) || ''), publish: isPublished(d) })
                  }
                  onDelete={() => setConfirm(d)}
                />
              }
            />
          ))
        )}
      </Page>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._key ? 'Edit deck' : 'New deck'}
        footer={
          <Button onClick={save} loading={busy}>
            {form?._key ? 'Save' : 'Add'}
          </Button>
        }
      >
        {form && (
          <>
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Congenital heart disease"
            />
            <Input
              label="System"
              value={form.system}
              onChange={(e) => setForm({ ...form, system: e.target.value })}
              placeholder="Cardiology"
              hint="Used by the progress and gaps screen. Reuse the same spelling across decks."
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
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
              placeholder="Cyanotic lesions"
            />
            <Textarea
              label="About (optional)"
              rows={2}
              value={form.about}
              onChange={(e) => setForm({ ...form, about: e.target.value })}
            />
            <ImageField folder="flashcards" value={form.img} onChange={(img) => setForm({ ...form, img })} />
            <Input
              label="Order (optional)"
              type="number"
              value={form.order}
              onChange={(e) => setForm({ ...form, order: e.target.value })}
              hint="Lower numbers come first inside this book."
            />
            <Toggle
              label="Published — visible to everyone"
              checked={form.publish !== false}
              onChange={(publish) => setForm({ ...form, publish })}
            />
          </>
        )}
      </Modal>

      <DangerConfirm
        open={!!confirm}
        busy={busy}
        title={`Delete “${confirm?.title}”?`}
        message="The deck and every card in it are removed for everyone."
        impact={[`All ${plural(num(confirm?.count), 'card')} in this deck are deleted.`]}
        keeps={[
          'Each person’s study history stays in their own account.',
          'Other decks in this book are untouched.',
        ]}
        confirmWord="DELETE"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await deleteDeck(confirm._key);
            toast('Deck deleted', 'success');
            setConfirm(null);
            list.reload();
          } catch (e) {
            toast(e.message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Level 4: cards inside a deck
// ---------------------------------------------------------------------------
const BLANK_CARD = { front: '', back: '', hint: '', note: '', img: '', back_img: '', tags: '', topic: '' };

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
      toast(form._key ? 'Card updated' : 'Card added', 'success');
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
        subtitle={`${plural(cards.length, 'card')}${deck?.system ? ` · ${deck.system}` : ''}`}
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
            <ImageField label="Front image" folder="flashcards" value={form.img} onChange={(img) => setForm((f) => ({ ...f, img }))} />
            <ImageField label="Back image" folder="flashcards" value={form.back_img} onChange={(img) => setForm((f) => ({ ...f, back_img: img }))} />
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
            ? `All ${plural(cards.length, 'card')} in “${deck?.title}” will be removed for everyone.`
            : confirm?.card?.front
        }
        impact={
          confirm?.all
            ? [`${plural(cards.length, 'card')} deleted in one go.`]
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
              toast('All cards deleted', 'success');
            } else {
              await updatePaths({
                [`flashcard_items/${deckId}/${confirm.card._key}`]: null,
                [`flashdecks/${deckId}/count`]: Math.max(0, cards.length - 1),
              });
              toast('Card deleted', 'success');
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
