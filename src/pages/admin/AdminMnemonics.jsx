// Mnemonic admin, kept apart from the flashcard admin.
//
//   /admin/mnemonics                exams (mnemonic categories) and their papers
//   /admin/mnemonics/paper/:source  one paper: its chapters and every mnemonic
//   /admin/mnemonics/edit?book&deck&card   one mnemonic: text, illustration,
//                                           section, source, linked flashcards
//
// Underneath, mnemonics still live in the flashcard tree (see lib/mnemonics.js)
// so they share the study screen and progress; this is just the place to
// manage them as mnemonics — with the illustration editor, the links to the
// flashcards they cover, and a warning before a duplicate is added.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Layers, Lightbulb, Link2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useAsync, useList } from '../../hooks/useData';
import { getOne, newKey, num, pushTo, removeAt, updateAt, updatePaths } from '../../lib/rtdb';
import { loadBook, loadByRefs, loadFlashcardPool } from '../../lib/mnemonicData';
import {
  MNEMONIC,
  SECTION_ORDER,
  findSimilar,
  isMnemonicCategory,
  mnemonicText,
  sectionOf,
  sourceOf,
} from '../../lib/mnemonics';
import { linkUpdates, linksMap, linksOf, refOf } from '../../lib/mnemonicLinks';
import { readVisual } from '../../components/MnemonicVisual';
import VisualEditor from '../../components/VisualEditor';
import ImageField from '../../components/ImageField';
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
  Select,
  SkeletonList,
  Textarea,
  Toggle,
  useToast,
} from '../../components/ui';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const isPublished = (x) => String(x?.publish) !== 'false';

function IconButton({ onClick, label, danger, children }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={`p-2 rounded-lg text-slate-400 ${danger ? 'hover:text-red-600 hover:bg-red-50' : 'hover:text-brand-700 hover:bg-brand-50'}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Exams and papers
// ---------------------------------------------------------------------------
export function MnemonicAdminHome() {
  const navigate = useNavigate();
  const toast = useToast();
  const cats = useList('flashcategory', { filter: isMnemonicCategory });
  const books = useList('flashbooks');
  const decks = useList('flashdecks');
  const [form, setForm] = useState(null); // { level: 'exam'|'paper', … }
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const papersOf = (exam) => books.data.filter((b) => b.main_category === exam.source);
  const countOf = (paper) =>
    decks.data.filter((d) => d.source === paper.source).reduce((s, d) => s + num(d.count), 0);

  const save = async () => {
    if (!form.title.trim() || !form.source.trim()) return toast('Enter a title and a source', 'error');
    setBusy(true);
    try {
      const record = {
        title: form.title.trim(),
        source: form.source.trim(),
        img: form.img || '',
        publish: form.publish,
        ...(form.level === 'exam' ? { kind: MNEMONIC } : { main_category: form.exam }),
      };
      const path = form.level === 'exam' ? 'flashcategory' : 'flashbooks';
      if (form._key) await updateAt(`${path}/${form._key}`, record);
      else await pushTo(path, record);
      toast('Saved', 'success');
      setForm(null);
      cats.reload();
      books.reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      <AppBar title="Mnemonics" subtitle="Exams → papers → chapters → mnemonics" />
      <Page className="space-y-4">
        <ErrorBox error={cats.error} onRetry={cats.reload} />
        <Button
          className="w-full"
          onClick={() => setForm({ level: 'exam', title: '', source: '', img: '', publish: true })}
        >
          <Plus size={18} /> Add exam
        </Button>
        {cats.loading ? (
          <SkeletonList />
        ) : cats.data.length === 0 ? (
          <Empty icon={<Lightbulb size={40} />} title="No mnemonic exams yet" />
        ) : (
          cats.data.map((exam) => (
            <Card key={exam._key} className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg text-slate-900">{exam.title}</p>
                  <p className="text-xs text-slate-500">
                    source: {exam.source}
                    {isPublished(exam) ? '' : ' · hidden'}
                  </p>
                </div>
                <IconButton
                  label="Edit exam"
                  onClick={() => setForm({ level: 'exam', _key: exam._key, title: exam.title || '', source: exam.source || '', img: exam.img || '', publish: isPublished(exam) })}
                >
                  <Pencil size={18} />
                </IconButton>
                <IconButton label="Delete exam" danger onClick={() => setConfirm({ level: 'exam', item: exam })}>
                  <Trash2 size={18} />
                </IconButton>
              </div>
              {papersOf(exam).map((p) => (
                <ListCard
                  key={p._key}
                  img={p.img}
                  title={p.title}
                  subtitle={`${plural(countOf(p), 'mnemonic')}${isPublished(p) ? '' : ' · hidden'}`}
                  onClick={() => navigate(`/admin/mnemonics/paper/${encodeURIComponent(p.source)}`)}
                  right={
                    <div className="flex shrink-0">
                      <IconButton
                        label="Edit paper"
                        onClick={() =>
                          setForm({ level: 'paper', exam: exam.source, _key: p._key, title: p.title || '', source: p.source || '', img: p.img || '', publish: isPublished(p) })
                        }
                      >
                        <Pencil size={18} />
                      </IconButton>
                      <IconButton label="Delete paper" danger onClick={() => setConfirm({ level: 'paper', item: p })}>
                        <Trash2 size={18} />
                      </IconButton>
                    </div>
                  }
                />
              ))}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setForm({ level: 'paper', exam: exam.source, title: '', source: '', img: '', publish: true })}
              >
                <Plus size={18} /> Add paper to {exam.title}
              </Button>
            </Card>
          ))
        )}
      </Page>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={`${form?._key ? 'Edit' : 'New'} ${form?.level === 'exam' ? 'exam' : 'paper'}`}
        footer={
          <Button onClick={save} loading={busy}>
            Save
          </Button>
        }
      >
        {form && (
          <>
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={form.level === 'exam' ? 'MRCPCH' : 'Theory and Science (TAS)'}
            />
            <Input
              label="Source"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              hint={
                form._key
                  ? 'What sits under this is matched by source — changing it hides everything already under it.'
                  : 'A short unique id, e.g. mnem-mrcpch-fop.'
              }
            />
            <ImageField folder="flashcards" value={form.img} onChange={(img) => setForm({ ...form, img })} />
            <Toggle label="Published — visible to everyone" checked={form.publish} onChange={(publish) => setForm({ ...form, publish })} />
          </>
        )}
      </Modal>

      <DangerConfirm
        open={!!confirm}
        busy={busy}
        title={`Delete “${confirm?.item?.title}”?`}
        message={confirm?.level === 'exam' ? 'The exam disappears from Mnemonics for everyone.' : 'The paper disappears from its exam for everyone.'}
        impact={['It is removed immediately']}
        keeps={[
          confirm?.level === 'exam'
            ? 'Its papers, chapters and mnemonics stay in the database but can no longer be reached — delete them first if you want them gone.'
            : 'Its chapters and mnemonics stay in the database but can no longer be reached — delete them first if you want them gone.',
        ]}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await removeAt(`${confirm.level === 'exam' ? 'flashcategory' : 'flashbooks'}/${confirm.item._key}`);
            toast('Deleted', 'success');
            setConfirm(null);
            cats.reload();
            books.reload();
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
// One paper: chapters and mnemonics
// ---------------------------------------------------------------------------
const BLANK_CHAPTER = { title: '', img: '', order: '', publish: true };

export function MnemonicAdminPaper() {
  const { source } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const book = useAsync(() => getOne('flashbooks').then((all) => Object.values(all || {}).find((b) => b.source === source)), [source]);
  const data = useAsync(() => loadBook(source), [source]);
  const [filters, setFilters] = useState({ deck: '', section: '', source: '', q: '' });
  const [chapterForm, setChapterForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showChapters, setShowChapters] = useState(false);

  const decks = data.data?.decks || [];
  const cards = data.data?.cards || [];
  const sections = useMemo(() => [...new Set(cards.map(sectionOf))].sort(), [cards]);
  const sources = useMemo(() => [...new Set(cards.map(sourceOf))].sort(), [cards]);
  const needle = filters.q.trim().toLowerCase();
  const shown = cards.filter(
    (c) =>
      (!filters.deck || c.deck === filters.deck) &&
      (!filters.section || sectionOf(c) === filters.section) &&
      (!filters.source || sourceOf(c) === filters.source) &&
      (!needle || mnemonicText(c).toLowerCase().includes(needle)),
  );
  const countIn = (deckId) => cards.filter((c) => c.deck === deckId).length;
  const editPath = (c) =>
    `/admin/mnemonics/edit?book=${encodeURIComponent(source)}&deck=${encodeURIComponent(c?.deck || filters.deck || '')}${c ? `&card=${encodeURIComponent(c._key)}` : ''}`;

  const saveChapter = async () => {
    if (!chapterForm.title.trim()) return toast('Enter a chapter title', 'error');
    setBusy(true);
    try {
      const key = chapterForm._key || newKey('flashdecks');
      await updateAt(`flashdecks/${key}`, {
        key,
        source,
        title: chapterForm.title.trim(),
        system: chapterForm.system || 'By system',
        topic: '',
        img: chapterForm.img || '',
        about: chapterForm.about || '',
        order: num(chapterForm.order) || decks.length + 1,
        publish: chapterForm.publish !== false,
        kind: MNEMONIC,
        ...(chapterForm._key ? {} : { count: 0, created: new Date().toISOString().slice(0, 10) }),
      });
      toast('Chapter saved', 'success');
      setChapterForm(null);
      data.reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      if (confirm.card) {
        const c = confirm.card;
        await updatePaths({
          [`flashcard_items/${c.deck}/${c._key}`]: null,
          [`flashdecks/${c.deck}/count`]: Math.max(0, countIn(c.deck) - 1),
          ...linkUpdates(refOf(c.deck, c._key), linksOf(c), []),
        });
      } else {
        await updatePaths({ [`flashdecks/${confirm.deck._key}`]: null, [`flashcard_items/${confirm.deck._key}`]: null });
      }
      toast('Deleted', 'success');
      setConfirm(null);
      data.reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen pb-28">
      <AppBar title={book.data?.title || 'Paper'} subtitle={`${plural(cards.length, 'mnemonic')} · ${plural(decks.length, 'chapter')}`} />
      <Page className="space-y-3">
        <ErrorBox error={data.error} onRetry={data.reload} />

        <Card className="p-4">
          <button className="flex w-full items-center gap-2 text-left" onClick={() => setShowChapters((s) => !s)}>
            <Layers size={18} className="text-teal-600" />
            <span className="flex-1 font-semibold text-slate-800">Chapters ({decks.length})</span>
            <span className="text-sm font-semibold text-teal-700">{showChapters ? 'Hide' : 'Manage'}</span>
          </button>
          {showChapters && (
            <div className="mt-3 space-y-2">
              {decks.map((d) => (
                <div key={d._key} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                    {num(d.order) || '·'}. {d.title}
                    <span className="text-slate-400"> · {countIn(d._key)}</span>
                    {isPublished(d) ? '' : <span className="text-amber-600"> · hidden</span>}
                  </span>
                  <IconButton label="Edit chapter" onClick={() => setChapterForm({ ...BLANK_CHAPTER, ...d, order: String(num(d.order) || ''), publish: isPublished(d) })}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton label="Delete chapter" danger onClick={() => setConfirm({ deck: d })}>
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={() => setChapterForm({ ...BLANK_CHAPTER })}>
                <Plus size={18} /> Add chapter
              </Button>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select value={filters.deck} onChange={(e) => setFilters({ ...filters, deck: e.target.value })} aria-label="Chapter">
            <option value="">All chapters</option>
            {decks.map((d) => (
              <option key={d._key} value={d._key}>
                {d.title}
              </option>
            ))}
          </Select>
          <Select value={filters.section} onChange={(e) => setFilters({ ...filters, section: e.target.value })} aria-label="Section">
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })} aria-label="Source">
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3">
            <Search size={16} className="text-slate-400" />
            <input className="min-w-0 flex-1 py-2.5 outline-none" placeholder="Search" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          </div>
        </div>
        <p className="text-sm text-slate-500">{plural(shown.length, 'mnemonic')} shown</p>

        {data.loading ? (
          <SkeletonList />
        ) : shown.length === 0 ? (
          <Empty icon={<Lightbulb size={40} />} title="No mnemonics match" />
        ) : (
          shown.map((c) => {
            const v = readVisual(c.visual) || {};
            const links = linksOf(c).length;
            return (
              <Card key={c._key} className="p-3">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl"
                    style={{ background: `${v.tone || '#0F7B6C'}22` }}
                    aria-hidden="true"
                  >
                    {v.emoji || '💡'}
                  </span>
                  <button className="min-w-0 flex-1 text-left" onClick={() => navigate(editPath(c))}>
                    <p className="font-semibold text-slate-800 line-clamp-1">{v.title || '(no title)'}</p>
                    <p className="text-sm text-slate-600 line-clamp-2">{c.front}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {c.deckTitle}{c.topic ? ` › ${c.topic}` : ''} · {sectionOf(c)} · {sourceOf(c)}
                      {links ? ` · 🔗 ${links}` : ' · no flashcards linked'}
                    </p>
                  </button>
                  <IconButton label="Edit" onClick={() => navigate(editPath(c))}>
                    <Pencil size={18} />
                  </IconButton>
                  <IconButton label="Delete" danger onClick={() => setConfirm({ card: c })}>
                    <Trash2 size={18} />
                  </IconButton>
                </div>
              </Card>
            );
          })
        )}
      </Page>

      <button
        onClick={() => navigate(editPath(null))}
        className="fixed bottom-6 right-5 z-30 flex items-center gap-2 rounded-full bg-teal-600 px-5 py-3.5 font-semibold text-white shadow-lg"
      >
        <Plus size={20} /> New mnemonic
      </button>

      <Modal
        open={!!chapterForm}
        onClose={() => setChapterForm(null)}
        title={chapterForm?._key ? 'Edit chapter' : 'New chapter'}
        footer={
          <Button onClick={saveChapter} loading={busy}>
            Save
          </Button>
        }
      >
        {chapterForm && (
          <>
            <Input label="Title" value={chapterForm.title} onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })} placeholder="Cardiology" />
            <Textarea label="About (optional)" rows={2} value={chapterForm.about || ''} onChange={(e) => setChapterForm({ ...chapterForm, about: e.target.value })} />
            <ImageField folder="flashcards" value={chapterForm.img} onChange={(img) => setChapterForm({ ...chapterForm, img })} />
            <Input label="Order" type="number" value={chapterForm.order} onChange={(e) => setChapterForm({ ...chapterForm, order: e.target.value })} />
            <Toggle label="Published — visible to everyone" checked={chapterForm.publish !== false} onChange={(publish) => setChapterForm({ ...chapterForm, publish })} />
          </>
        )}
      </Modal>

      <DangerConfirm
        open={!!confirm}
        busy={busy}
        title={confirm?.card ? 'Delete this mnemonic?' : `Delete the chapter “${confirm?.deck?.title}”?`}
        message={confirm?.card ? confirm.card.front : 'The chapter and every mnemonic in it are removed for everyone.'}
        impact={confirm?.card ? ['This mnemonic is removed for everyone.', 'Its links to flashcards are removed too.'] : [`${plural(countIn(confirm?.deck?._key), 'mnemonic')} deleted.`]}
        keeps={['The flashcards themselves are not touched.']}
        onCancel={() => setConfirm(null)}
        onConfirm={remove}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One mnemonic
// ---------------------------------------------------------------------------
function LinkedRow({ card, onRemove, onAdd }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-slate-100 bg-white p-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 line-clamp-2">{card.front}</p>
        <p className="text-xs text-slate-500 line-clamp-2">{card.back}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {[card.bookTitle, card.deckTitle].filter(Boolean).join(' · ')}
        </p>
      </div>
      {onRemove && (
        <IconButton label="Unlink" danger onClick={onRemove}>
          <X size={16} />
        </IconButton>
      )}
      {onAdd && (
        <button onClick={onAdd} className="shrink-0 rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100">
          Link
        </button>
      )}
    </div>
  );
}

export function MnemonicAdminEdit() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const bookSource = params.get('book') || '';
  const cardKey = params.get('card') || '';
  const startDeck = params.get('deck') || '';

  const data = useAsync(async () => {
    const book = await loadBook(bookSource);
    const original = cardKey ? book.cards.find((c) => c._key === cardKey && c.deck === startDeck) : null;
    const linked = original ? await loadByRefs(linksOf(original)) : [];
    return { ...book, original, linked };
  }, [bookSource, cardKey, startDeck]);

  const [form, setForm] = useState(null);
  const [linkedCards, setLinkedCards] = useState([]);
  const [pool, setPool] = useState(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  // Fill the form whenever a card (or the blank) has been loaded — including
  // after jumping to a look-alike, which loads a different card.
  useEffect(() => {
    if (!data.data) return;
    const o = data.data.original;
    setForm({
      front: o?.front || '',
      deck: o?.deck || startDeck || data.data.decks[0]?._key || '',
      section: o ? sectionOf(o) : 'Clinical',
      topic: o?.topic || '',
      source: o?.source || '',
      visual: readVisual(o?.visual) || { tone: '#0F7B6C', emoji: '💡', title: '', hook: '' },
    });
    setLinkedCards(data.data.linked);
  }, [data.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const cards = data.data?.cards || [];
  const decks = data.data?.decks || [];
  const original = data.data?.original || null;
  const sources = useMemo(() => [...new Set(cards.map((c) => c.source).filter(Boolean))].sort(), [cards]);
  const topics = useMemo(
    () => [...new Set(cards.filter((c) => c.deck === form?.deck).map((c) => c.topic).filter(Boolean))],
    [cards, form?.deck],
  );
  const linkedRefs = linkedCards.map((c) => refOf(c.deck, c._key));

  const draftText = form ? mnemonicText({ front: form.front, visual: form.visual }) : '';
  const lookAlikes = useMemo(
    () =>
      form
        ? findSimilar(draftText, cards.filter((c) => c._key !== cardKey), mnemonicText, { min: 0.6, limit: 4 })
        : [],
    [draftText, cards, cardKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const suggestions = useMemo(() => {
    if (!pool || !form) return [];
    const taken = new Set(linkedRefs);
    const free = pool.filter((c) => !taken.has(refOf(c.deck, c._key)));
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      return free.filter((c) => `${c.front} ${c.back}`.toLowerCase().includes(needle)).slice(0, 30).map((item) => ({ item }));
    }
    return findSimilar(draftText, free, (c) => `${c.front} ${c.back}`, { min: 0.5, limit: 12 });
  }, [pool, q, draftText, linkedRefs.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPool = async () => {
    setPoolLoading(true);
    try {
      setPool(await loadFlashcardPool());
    } catch (e) {
      toast(e.message || 'Could not load the flashcards', 'error');
    } finally {
      setPoolLoading(false);
    }
  };

  const back = () => navigate(`/admin/mnemonics/paper/${encodeURIComponent(bookSource)}`, { replace: true });

  const save = async () => {
    if (!form.front.trim()) return toast('Write the front: what the mnemonic helps you recall', 'error');
    if (!form.deck) return toast('Choose a chapter', 'error');
    if (!form.visual?.title?.trim() || !form.visual?.hook?.trim()) return toast('The illustration needs a title and a hook', 'error');
    setBusy(true);
    try {
      const key = cardKey || newKey(`flashcard_items/${form.deck}`);
      const moved = !!original && original.deck !== form.deck;
      const inDeck = (id) => cards.filter((c) => c.deck === id).length;
      const { _key, deckTitle, _ref, ...kept } = original || {}; // eslint-disable-line no-unused-vars
      const record = {
        img: '',
        hint: '',
        note: '',
        tags: '',
        ...kept,
        deck: form.deck,
        order: original && !moved ? num(original.order) : inDeck(form.deck) + 1,
        front: form.front.trim(),
        back: '',
        back_img: '',
        visual: form.visual,
        chapter: form.section === 'Clinical' ? '' : form.section.trim(),
        // The heading this mnemonic sits under inside its chapter.
        topic: String(form.topic || '').trim(),
        source: form.source.trim(),
        links: linksMap(linkedRefs),
      };
      const before = original ? linksOf(original) : [];
      const updates = { [`flashcard_items/${form.deck}/${key}`]: record };
      if (moved) {
        updates[`flashcard_items/${original.deck}/${key}`] = null;
        updates[`flashdecks/${original.deck}/count`] = Math.max(0, inDeck(original.deck) - 1);
        updates[`flashdecks/${form.deck}/count`] = inDeck(form.deck) + 1;
        Object.assign(updates, linkUpdates(refOf(original.deck, key), before, []), linkUpdates(refOf(form.deck, key), [], linkedRefs));
      } else {
        if (!original) updates[`flashdecks/${form.deck}/count`] = inDeck(form.deck) + 1;
        Object.assign(updates, linkUpdates(refOf(form.deck, key), before, linkedRefs));
      }
      await updatePaths(updates);
      toast(original ? 'Mnemonic saved' : 'Mnemonic added', 'success');
      back();
    } catch (e) {
      toast(e.message || 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (data.loading || !form || !data.data) {
    return (
      <div className="min-h-screen">
        <AppBar title="Mnemonic" />
        <Page>
          <ErrorBox error={data.error} onRetry={data.reload} />
          {!data.error && <SkeletonList rows={3} />}
        </Page>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      <AppBar title={original ? 'Edit mnemonic' : 'New mnemonic'} onBack={back} />
      <Page className="space-y-4 lg:max-w-6xl">
        {lookAlikes.length > 0 && (
          <Card className="border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 font-semibold text-amber-900">
              <AlertTriangle size={18} /> Possible duplicate
            </p>
            <p className="mt-0.5 text-sm text-amber-800">These mnemonics look like the same topic. Edit one of them instead of adding another?</p>
            <div className="mt-2 space-y-1.5">
              {lookAlikes.map(({ item, score }) => (
                <button
                  key={item._key}
                  onClick={() => {
                    setForm(null);
                    navigate(`/admin/mnemonics/edit?book=${encodeURIComponent(bookSource)}&deck=${encodeURIComponent(item.deck)}&card=${encodeURIComponent(item._key)}`);
                  }}
                  className="block w-full rounded-lg bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-amber-100"
                >
                  <b>{readVisual(item.visual)?.title}</b> — {item.front}
                  <span className="text-xs text-slate-400"> · {item.deckTitle} · {Math.round(score * 100)}% alike</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-4 space-y-3">
          <Textarea
            label="Front — what this helps you recall"
            rows={2}
            value={form.front}
            onChange={(e) => setForm({ ...form, front: e.target.value })}
            hint="Keep it short and plain: topic · what to recall, e.g. “Neonatal hypoglycaemia · causes”. Name a list, sequence or easily confused pair — a single fact belongs in the flashcards."
          />
          <div>
            <Input
              label="Topic within the chapter"
              value={form.topic}
              list="mnem-topics"
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
              hint="Related mnemonics share a topic and are shown together, e.g. “Cyanotic lesions”."
            />
            <datalist id="mnem-topics">
              {topics.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select label="Chapter" value={form.deck} onChange={(e) => setForm({ ...form, deck: e.target.value })}>
              {decks.map((d) => (
                <option key={d._key} value={d._key}>
                  {d.title}
                </option>
              ))}
            </Select>
            <div>
              <Input label="Basic science section" value={form.section} list="mnem-sections" onChange={(e) => setForm({ ...form, section: e.target.value })} />
              <datalist id="mnem-sections">
                {SECTION_ORDER.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <Input label="Source" value={form.source} list="mnem-sources" onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="TAS 2025 paper" />
              <datalist id="mnem-sources">
                {sources.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <VisualEditor value={form.visual} onChange={(visual) => setForm({ ...form, visual })} source={form.source} />
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-teal-600" />
            <p className="flex-1 font-semibold text-slate-800">Flashcards this mnemonic covers ({linkedCards.length})</p>
          </div>
          <p className="text-sm text-slate-500">
            The facts stay in these flashcards. Each one gets a “See the mnemonic” button, and the mnemonic gets “Test yourself”.
          </p>
          {linkedCards.map((c) => (
            <LinkedRow key={refOf(c.deck, c._key)} card={c} onRemove={() => setLinkedCards((l) => l.filter((x) => x !== c))} />
          ))}
          {!pool ? (
            <Button variant="outline" className="w-full" onClick={openPool} loading={poolLoading}>
              <Search size={18} /> Find flashcards to link
            </Button>
          ) : (
            <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3">
                <Search size={16} className="text-slate-400" />
                <input className="min-w-0 flex-1 py-2.5 outline-none" placeholder={`Search ${pool.length} flashcards`} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <p className="text-xs text-slate-500">{q.trim() ? 'Matches' : 'Suggested from the text of this mnemonic'}</p>
              {suggestions.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing found — try searching.</p>
              ) : (
                suggestions.map(({ item }) => (
                  <LinkedRow key={refOf(item.deck, item._key)} card={item} onAdd={() => setLinkedCards((l) => [...l, item])} />
                ))
              )}
            </div>
          )}
        </Card>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 justify-center" onClick={back} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1 justify-center" onClick={save} loading={busy}>
            Save
          </Button>
        </div>
      </Page>
    </div>
  );
}
