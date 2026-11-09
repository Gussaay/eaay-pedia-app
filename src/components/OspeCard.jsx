// Pieces shared by the OSPE pages: the photo, the back of a card (source,
// diagnosis, short description, exam count) and a grid tile.
//
// The picture always sits on white (content-img), even in dark mode, because
// X-rays and drawings are made for a light background.
import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { useDeviceImage } from './ui';
import { examCount, shortCaption } from '../../functions/ospeCore.js';

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

const creditLine = (credit) =>
  !credit ? 'Photo source not recorded' : /^(photo|picture|image)\b/i.test(credit) ? credit : `Photo: ${credit}`;

/**
 * The back of a card, shown under the photo: the photo's source in small
 * print right under it, then the diagnosis in big type with one short line,
 * then how many exams it came up in (owner's layout, 2026-11-09).
 */
export function OspeBack({ card }) {
  const exams = examCount(card);
  return (
    <div className="space-y-2 text-left">
      <p className="text-[11px] leading-snug text-slate-400">{creditLine(card.credit)}</p>
      <p className="font-display text-3xl font-bold leading-tight text-slate-900">{card.title}</p>
      {card.caption && <p className="text-base leading-snug text-slate-600">{shortCaption(card.caption)}</p>}
      {exams > 0 && (
        <p className="text-sm font-semibold text-brand-700">
          Seen in {exams} exam{exams === 1 ? '' : 's'}
        </p>
      )}
      {card.status === 'auto' && <p className="text-[11px] italic text-amber-700">Auto caption, not yet checked.</p>}
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
