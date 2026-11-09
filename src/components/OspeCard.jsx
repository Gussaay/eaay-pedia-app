// Pieces shared by the OSPE pages: the picture, the back of a card (title,
// caption, credit and where it appears in the app) and a grid tile.
//
// The picture always sits on white (content-img), even in dark mode, because
// X-rays and drawings are made for a light background.
import { Link } from 'react-router-dom';
import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { useDeviceImage } from './ui';
import { quizPath } from '../lib/quizSource';

export function OspePicture({ src: original, className = '' }) {
  const src = useDeviceImage(original);
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-slate-400 py-8">
        <ImageOff size={16} /> Image unavailable
      </div>
    );
  if (!src) return <div className={className} aria-hidden="true" />;
  return <img src={src} alt="" onError={() => setBroken(true)} className={`content-img object-contain bg-white rounded-xl ${className}`} />;
}

/** Question sources link to their quiz when we know its key; anything else shows the label only. */
function SourceLine({ s }) {
  const to = s.type === 'q' && s.quiz ? quizPath('exam', s.quiz) : '';
  return (
    <li>
      {to ? (
        <Link to={to} className="text-brand-700 underline decoration-brand-200" onClick={(e) => e.stopPropagation()}>
          {s.label}
        </Link>
      ) : (
        s.label
      )}
    </li>
  );
}

export function OspeBack({ card }) {
  const sources = Object.values(card.sources || {}).filter((s) => s?.label);
  return (
    <div className="space-y-2 text-left">
      <p className="font-display text-xl font-bold leading-snug text-slate-800">{card.title}</p>
      {card.caption && <p className="text-sm leading-snug text-slate-600">{card.caption}</p>}
      <p className="text-xs text-slate-500">{card.credit ? (/^(photo|picture|illustration|image|drawing)\b/i.test(card.credit) || /easy pedia drawing/i.test(card.credit) ? card.credit : `Picture: ${card.credit}`) : 'Picture source not recorded'}</p>
      {sources.length > 0 && (
        <div className="text-xs text-slate-500">
          <p className="font-semibold text-slate-600">In the app:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {sources.map((s, i) => (
              <SourceLine key={i} s={s} />
            ))}
          </ul>
        </div>
      )}
      {card.status === 'auto' && <p className="text-[11px] italic text-amber-700">Auto caption, written from the question text and not yet checked.</p>}
    </div>
  );
}

export function OspeTile({ card, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white text-left shadow-sm transition hover:shadow-md active:scale-[0.98]"
    >
      <OspePicture src={card.img} className="h-32 w-full !rounded-none" />
      <p className="px-3 py-2 text-xs font-semibold leading-snug text-slate-700 line-clamp-2">{card.title}</p>
    </button>
  );
}
