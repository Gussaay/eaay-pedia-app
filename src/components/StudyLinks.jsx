// "Remember it" under a quiz explanation: the mnemonic, the flashcards and the
// similar questions linked to this one (quizqq/<id>/mnem_links, card_links and
// similar), opened over the quiz so the session is not lost.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Copy, Layers, Lightbulb, X } from 'lucide-react';
import { useAsync } from '../hooks/useData';
import { useBackHandler } from '../lib/back';
import { loadByRefs } from '../lib/mnemonicData';
import { questionLinks } from '../lib/mnemonicLinks';
import { similarOf } from '../lib/questionHints';
import { visibleOptions } from '../lib/quiz';
import { getOne } from '../lib/rtdb';
import MnemonicPeek from './MnemonicPeek';
import { Spinner, ZoomImage } from './ui';

export default function StudyLinks({ question }) {
  const { mnemonics, flashcards } = questionLinks(question);
  const [mnemonic, setMnemonic] = useState(null);
  const similar = similarOf(question);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [similarOpen, setSimilarOpen] = useState(false);
  // Only the mnemonic titles are read up front; the flashcards wait for a tap.
  const titles = useAsync(
    () => (mnemonics.length ? loadByRefs(mnemonics) : Promise.resolve([])),
    [mnemonics.join(',')],
  );
  if (!mnemonics.length && !flashcards.length && !similar.length) return null;

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <p className="text-sm font-semibold text-slate-700 mb-2">Remember it</p>
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
        {similar.length > 0 && (
          <button
            onClick={() => setSimilarOpen(true)}
            className="w-full flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left hover:bg-amber-100"
          >
            <Copy size={18} className="shrink-0 text-amber-600" />
            <span className="flex-1 text-sm font-medium text-slate-800">
              {similar.length} similar question{similar.length > 1 ? 's' : ''}
            </span>
            <ChevronRight size={18} className="shrink-0 text-amber-400" />
          </button>
        )}
      </div>
      {mnemonic && <MnemonicPeek mnemonicRef={mnemonic} onClose={() => setMnemonic(null)} />}
      {cardsOpen && <FlashcardsPeek refs={flashcards} onClose={() => setCardsOpen(false)} />}
      {similarOpen && <SimilarPeek ids={similar} onClose={() => setSimilarOpen(false)} />}
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

// The similar questions, each answerable in place: pick an option to see the
// answer and its explanation.
function SimilarPeek({ ids, onClose }) {
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
    <Sheet icon={<Copy size={18} className="shrink-0 text-amber-600" />} title="Similar questions" tone="text-amber-700" onClose={onClose}>
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
          <p className="text-xs text-slate-500 mb-3">Questions on the same point from other papers. Pick an answer to check it.</p>
          <ul className="space-y-3">
            {list.map((q, n) => {
              const answer = String(q.answer || '').trim().toLowerCase();
              const chosen = picked[q._key];
              const from = q.title || q.quiztitle;
              return (
                <li key={q._key} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1">
                    Question {n + 1}
                    {from ? <span className="font-normal text-slate-500"> · {from}</span> : null}
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
