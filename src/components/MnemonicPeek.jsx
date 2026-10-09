// A mnemonic opened over whatever screen asked for it — from a flashcard's
// "See the mnemonic" button, for instance — without leaving that screen.
//
// Portalled to <body> so it is fixed to the screen even when opened from
// inside the turning flashcard (a transformed ancestor would otherwise become
// its containing block).
import { createPortal } from 'react-dom';
import { Lightbulb, X } from 'lucide-react';
import { useAsync } from '../hooks/useData';
import { useBackHandler } from '../lib/back';
import { loadByRefs } from '../lib/mnemonicData';
import MnemonicVisual from './MnemonicVisual';
import ShareMnemonicButton from './ShareMnemonic';
import { Spinner } from './ui';

export default function MnemonicPeek({ mnemonicRef, onClose }) {
  const data = useAsync(() => loadByRefs([mnemonicRef]).then((list) => list[0] || null), [mnemonicRef]);
  useBackHandler(() => {
    onClose();
    return true;
  });
  const card = data.data;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="flex h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <Lightbulb size={18} className="shrink-0 text-teal-600" />
          <p className="flex-1 text-sm font-semibold text-teal-700">Mnemonic</p>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={22} />
          </button>
        </div>
        {data.loading ? (
          <div className="m-auto">
            <Spinner />
          </div>
        ) : !card ? (
          <p className="m-auto p-6 text-center text-sm text-slate-500">
            {data.error ? 'Could not load the mnemonic. Check your connection.' : 'This mnemonic is no longer available.'}
          </p>
        ) : (
          <>
            <p className="px-4 pb-2 text-base font-medium leading-snug text-slate-800">{card.front}</p>
            <div className="relative min-h-0 flex-1 px-3 pb-3">
              <MnemonicVisual visual={card.visual} source={card.source} />
              <ShareMnemonicButton card={card} className="absolute right-5 top-2" />
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
