// "Remember it" under a quiz explanation: the mnemonic, the flashcards, the
// topic tags and the linked questions (quizqq/<id>/mnem_links, card_links,
// tags, and same + similar), opened over the quiz so the session is not lost.
// Linked questions are the copies of this question asked in other sittings,
// the similar questions and other questions on the same topic (qtags/<slug>),
// all answerable in one list.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Layers, Lightbulb, Repeat2, Tag, X } from 'lucide-react';
import { useAsync } from '../hooks/useData';
import { useBackHandler } from '../lib/back';
import { loadByRefs } from '../lib/mnemonicData';
import { questionLinks } from '../lib/mnemonicLinks';
import { sameOf, similarOf } from '../lib/questionHints';
import { visibleOptions } from '../lib/quiz';
import { getOne } from '../lib/rtdb';
import { tagsOf } from '../lib/topicTags';
import MnemonicPeek from './MnemonicPeek';
import { Spinner, ZoomImage } from './ui';

// A topic shared by hundreds of questions would make a long list to load; this
// many are shown per topic.
const TOPIC_MAX = 30;

export default function StudyLinks({ question }) {
  const { mnemonics, flashcards } = questionLinks(question);
  const [mnemonic, setMnemonic] = useState(null);
  const similar = similarOf(question);
  const same = sameOf(question);
  const tags = tagsOf(question);
  const [cardsOpen, setCardsOpen] = useState(false);
  // null when closed; otherwise the tag slug to show alone, or '' for every linked question.
  const [linkedOpen, setLinkedOpen] = useState(null);
  // The other questions under each tag: [{ slug, label, ids }].
  const topicData = useAsync(
    () =>
      Promise.all(
        tags.map((t) =>
          getOne(`qtags/${t.slug}`)
            .catch(() => null)
            .then((v) => ({ ...t, ids: Object.keys(v || {}).filter((id) => v[id] && id !== question?._key) })),
        ),
      ),
    [question?._key, tags.map((t) => t.slug).join(',')],
  );
  const topics = topicData.data || [];
  const known = new Set([...same, ...similar]);
  const topicIds = [...new Set(topics.flatMap((t) => t.ids.slice(0, TOPIC_MAX)))].filter((id) => !known.has(id));
  const linked = same.length + similar.length + topicIds.length;
  // Only the mnemonic titles are read up front; the flashcards wait for a tap.
  const titles = useAsync(
    () => (mnemonics.length ? loadByRefs(mnemonics) : Promise.resolve([])),
    [mnemonics.join(',')],
  );
  if (!mnemonics.length && !flashcards.length && !similar.length && !same.length && !tags.length) return null;

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <p className="text-sm font-semibold text-slate-700 mb-2">Remember it</p>
      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Tag size={14} className="shrink-0 text-sky-600" aria-label="Topics" />
          {tags.map((t) => {
            const n = topics.find((x) => x.slug === t.slug)?.ids.length || 0;
            return (
              <button
                key={t.slug}
                onClick={() => setLinkedOpen(t.slug)}
                disabled={!n}
                className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:hover:bg-sky-50"
              >
                {t.label}
                {n > 0 && <span className="ml-1 text-sky-500">{n}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="space-y-2">
        {mnemonics.map((ref, i) => {
          const card = (titles.data || []).find((c) => c._ref === ref);
          if (titles.data && !card) return null;
          return (
            <button
              key={ref}
              onClick={() => setMnemonic(ref)}
              className="w-full flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-left hover:bg-teal-100"
            >
              <Lightbulb size={18} className="shrink-0 text-teal-600" />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-teal-700">
                  Mnemonic{mnemonics.length > 1 ? ` ${i + 1}` : ''}
                </span>
                <span className="block text-sm text-slate-800 line-clamp-2">{card?.front || 'Loading…'}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-teal-400" />
            </button>
          );
        })}
        {flashcards.length > 0 && (
          <button
            onClick={() => setCardsOpen(true)}
            className="w-full flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-left hover:bg-brand-100"
          >
            <Layers size={18} className="shrink-0 text-brand-600" />
            <span className="flex-1 text-sm font-medium text-slate-800">
              {flashcards.length} linked flashcard{flashcards.length > 1 ? 's' : ''}
            </span>
            <ChevronRight size={18} className="shrink-0 text-brand-400" />
          </button>
        )}
        {linked > 0 && (
          <button
            onClick={() => setLinkedOpen('')}
            className="w-full flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left hover:bg-amber-100"
          >
            <Repeat2 size={18} className="shrink-0 text-amber-600" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-slate-800">
                {linked} linked question{linked > 1 ? 's' : ''}
              </span>
              <span className="block text-xs text-slate-500">
                {[
                  same.length ? `Asked in ${same.length + 1} sittings` : '',
                  similar.length ? `${similar.length} similar` : '',
                  topicIds.length ? `${topicIds.length} on the same topic` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-amber-400" />
          </button>
        )}
      </div>
      {mnemonic && <MnemonicPeek mnemonicRef={mnemonic} onClose={() => setMnemonic(null)} />}
      {cardsOpen && <FlashcardsPeek refs={flashcards} onClose={() => setCardsOpen(false)} />}
      {linkedOpen !== null && (
        <LinkedPeek
          same={linkedOpen ? [] : same}
          similar={linkedOpen ? [] : similar}
          topics={topics
            .filter((t) => !linkedOpen || t.slug === linkedOpen)
            .map((t) => ({ ...t, ids: t.ids.slice(0, TOPIC_MAX) }))}
          title={linkedOpen ? tags.find((t) => t.slug === linkedOpen)?.label : ''}
          onClose={() => setLinkedOpen(null)}
        />
      )}
    </div>
  );
}

// The bottom sheet the peeks open in.
function Sheet({ icon, title, tone, onClose, children }) {
  useBackHandler(() => {
    onClose();
    return true;
  });
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          {icon}
          <p className={`flex-1 text-sm font-semibold ${tone}`}>{title}</p>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// The linked questions, each answerable in place: the copies of this same
// question from other sittings first, then the similar questions, then other
// questions on the same topic. Pick an option to see the answer and its
// explanation. With a `title`, it lists one topic's questions.
function LinkedPeek({ same, similar, topics = [], title = '', onClose }) {
  const isSame = new Set(same);
  const isSimilar = new Set(similar);
  const topicOf = new Map();
  topics.forEach((t) => t.ids.forEach((id) => topicOf.has(id) || topicOf.set(id, t.label)));
  const ids = [...new Set([...same, ...similar, ...topicOf.keys()])];
  const data = useAsync(
    () =>
      Promise.all(ids.map((id) => getOne(`quizqq/${id}`).then((q) => q && { ...q, _key: id }))).then((l) =>
        l.filter(Boolean),
      ),
    [ids.join(',')],
  );
  const [picked, setPicked] = useState({});
  const list = data.data || [];
  return (
    <Sheet icon={<Repeat2 size={18} className="shrink-0 text-amber-600" />} title={title ? `Topic: ${title}` : 'Linked questions'} tone="text-amber-700" onClose={onClose}>
      {data.loading ? (
        <div className="py-10">
          <Spinner />
        </div>
      ) : !list.length ? (
        <p className="py-10 text-center text-sm text-slate-500">
          {data.error ? 'Could not load the questions. Check your connection.' : 'These questions are no longer available.'}
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-3">
            {title
              ? 'Other questions tagged with this topic. Pick an answer to check it.'
              : `${same.length ? `This question came up in ${same.length + 1} sittings. ` : ''}The same question from other sittings, similar questions and questions on the same topic. Pick an answer to check it.`}
          </p>
          <ul className="space-y-3">
            {list.map((q, n) => {
              const answer = String(q.answer || '').trim().toLowerCase();
              const chosen = picked[q._key];
              const from = q.title || q.quiztitle;
              return (
                <li key={q._key} className="rounded-xl border border-slate-200 p-3">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-amber-700 mb-1">
                    Question {n + 1}
                    {isSame.has(q._key) ? (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">Same question</span>
                    ) : isSimilar.has(q._key) ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Similar</span>
                    ) : (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">Same topic · {topicOf.get(q._key)}</span>
                    )}
                    {from ? <span className="font-normal text-slate-500">{from}</span> : null}
                  </p>
                  <p className="text-sm font-medium text-slate-800 whitespace-pre-line">{q.question}</p>
                  <ZoomImage src={q.question_img} className="mt-2" />
                  <div className="mt-2 space-y-1.5">
                    {visibleOptions(q, q.source).map((k) => {
                      const isAns = chosen && k === answer;
                      const isWrong = chosen && k === chosen && k !== answer;
                      return (
                        <button
                          key={k}
                          disabled={!!chosen}
                          onClick={() => setPicked((p) => ({ ...p, [q._key]: k }))}
                          className={`w-full flex gap-2 items-start rounded-lg border px-2.5 py-2 text-left text-sm ${
                            isAns
                              ? 'border-emerald-400 bg-emerald-50'
                              : isWrong
                                ? 'border-red-400 bg-red-50'
                                : 'border-slate-200 bg-white hover:border-brand-300'
                          }`}
                        >
                          <b className="uppercase text-slate-500">{k}</b>
                          <span className="flex-1 text-slate-800 whitespace-pre-line">{q[k]}</span>
                        </button>
                      );
                    })}
                  </div>
                  {chosen && (q.exp || q.exp_img) && (
                    <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
                      {q.exp && <p className="text-sm text-slate-700 whitespace-pre-line">{String(q.exp).trim()}</p>}
                      <ZoomImage src={q.exp_img} className="mt-2" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}

function FlashcardsPeek({ refs, onClose }) {
  const data = useAsync(() => loadByRefs(refs), [refs.join(',')]);
  const [shown, setShown] = useState({});
  const cards = data.data || [];
  return (
    <Sheet icon={<Layers size={18} className="shrink-0 text-brand-600" />} title="Linked flashcards" tone="text-brand-700" onClose={onClose}>
      {data.loading ? (
        <div className="py-10">
          <Spinner />
        </div>
      ) : !cards.length ? (
        <p className="py-10 text-center text-sm text-slate-500">
          {data.error ? 'Could not load the flashcards. Check your connection.' : 'These flashcards are no longer available.'}
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-3">Try to recall the answer, then tap the card to check.</p>
          <ul className="space-y-2">
            {cards.map((c) => {
              const open = !!shown[c._ref];
              return (
                <li key={c._ref}>
                  <button
                    onClick={() => setShown((s) => ({ ...s, [c._ref]: !open }))}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                      open ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white hover:border-brand-300'
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-800 whitespace-pre-line">{c.front}</p>
                    {open ? (
                      <>
                        {c.back && <p className="mt-2 text-sm text-emerald-900 whitespace-pre-line">{c.back}</p>}
                        <ZoomImage src={c.back_img} className="mt-2" />
                      </>
                    ) : (
                      <p className="mt-1 text-xs font-semibold text-brand-600">Tap to show the answer</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}
