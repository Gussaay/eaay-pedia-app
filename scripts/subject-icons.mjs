// A subject icon for every deck and quiz.
//
// The uploads all shared one cover photo, which makes 28 quizzes look like 28
// copies of the same thing. These are drawn instead: a rounded tile in the
// subject's own colour with a white line-art glyph, encoded as a data URI so
// there is nothing to host and nothing to break. If one ever fails to render,
// `Thumb` falls back to the initials tile it already shows today.
//
// Each glyph is deliberately simple. A stomach that is recognisable at 40px
// beats an anatomically perfect one that turns to mush.

/**
 * [from, to] gradient, then the glyph as SVG markup drawn inside a 96x96 box.
 * Markup rather than a bare path so a shape that is genuinely a circle or a
 * rotated capsule can be written as one, instead of being faked with curves.
 */
const SUBJECTS = {
  'Adolescent Health': ['#6366F1', '#8B5CF6', '<path d="M48 30a9 9 0 1 1 0 18 9 9 0 0 1 0-18M30 70c0-10 8-16 18-16s18 6 18 16"/>'],
  Anatomy: ['#64748B', '#94A3B8', '<path d="M63 41H33a7 7 0 1 1-6 3 7 7 0 1 1 6 11h30a7 7 0 1 1 6-3 7 7 0 1 1-6-11z"/>'],
  Biochemistry: ['#0EA5E9', '#38BDF8', '<path d="M42 26v16L28 64c-2 4 1 8 5 8h30c4 0 7-4 5-8L54 42V26M38 26h20M34 54h28"/>'],
  Dermatology: ['#F59E0B', '#FBBF24', '<path d="M26 40c8-6 14 6 22 0s14 6 22 0M26 52c8-6 14 6 22 0s14 6 22 0M26 64c8-6 14 6 22 0s14 6 22 0"/>'],
  Emergencies: ['#EF4444', '#F87171', '<path d="M48 26v44M26 48h44"/>'],
  Endocrine: ['#EC4899', '#F472B6', '<path d="M48 38v24M48 40c-3-6-11-8-16-4s-5 15 0 19 13 2 16-4M48 40c3-6 11-8 16-4s5 15 0 19-13 2-16-4M36 26h24"/>'],
  Epidemiology: ['#14B8A6', '#2DD4BF', '<path d="M28 68V50M42 68V36M56 68V44M70 68V28M24 68h48"/>'],
  Ethics: ['#8B5CF6', '#A78BFA', '<path d="M48 26v44M32 70h32M30 38h36M30 38l-8 16h16zM66 38l8 16H58z"/>'],
  Gastro: ['#F97316', '#FB923C', '<path d="M40 22v12c0 5-10 6-10 18 0 13 10 22 21 22 10 0 17-7 17-15 0-9-7-13-14-13h-5"/>'],
  Genetics: ['#10B981', '#34D399', '<path d="M36 24c0 16 24 16 24 32s-24 16-24 32M60 24c0 16-24 16-24 32s24 16 24 32M38 36h20M36 52h24M38 68h20"/>'],
  Haematology: ['#DC2626', '#EF4444', '<path d="M48 24c10 14 16 22 16 30a16 16 0 0 1-32 0c0-8 6-16 16-30z"/>'],
  Immunology: ['#2563EB', '#3B82F6', '<path d="M48 24l20 8v18c0 14-9 22-20 26-11-4-20-12-20-26V32zM40 50l6 6 12-12"/>'],
  Infection: ['#84CC16', '#A3E635', '<path d="M48 34a14 14 0 1 1 0 28 14 14 0 0 1 0-28M48 24v10M48 62v10M28 48h10M58 48h10M34 34l7 7M55 55l7 7M62 34l-7 7M41 55l-7 7"/>'],
  Metabolic: ['#06B6D4', '#22D3EE', '<path d="M48 30a7 7 0 1 1 0 14 7 7 0 0 1 0-14M32 58a7 7 0 1 1 0 14 7 7 0 0 1 0-14M64 58a7 7 0 1 1 0 14 7 7 0 0 1 0-14M44 42L36 56M52 42l8 14M39 66h18"/>'],
  Microbiology: ['#65A30D', '#84CC16', '<path d="M34 34a14 14 0 0 1 28 0v12a14 14 0 0 1-28 0zM34 40h28M34 46h28M30 30l-6-6M66 30l6-6M30 56l-6 6M66 56l6 6M48 66v10"/>'],
  Statistics: ['#0D9488', '#2DD4BF', '<path d="M28 68V50M42 68V36M56 68V44M70 68V28M24 68h48M26 40l16-12 14 8 14-14"/>'],
  Molecular: ['#7C3AED', '#A78BFA', '<circle cx="48" cy="48" r="7"/><ellipse cx="48" cy="48" rx="25" ry="10"/><ellipse cx="48" cy="48" rx="25" ry="10" transform="rotate(60 48 48)"/><ellipse cx="48" cy="48" rx="25" ry="10" transform="rotate(-60 48 48)"/>'],
  Neonatology: ['#F472B6', '#FB7185', '<path d="M48 28a14 14 0 1 1 0 28 14 14 0 0 1 0-28M42 42h.5M54 42h.5M43 50c3 3 7 3 10 0M30 72c2-8 9-12 18-12s16 4 18 12"/>'],
  Nephrology: ['#0891B2', '#22D3EE', '<path d="M58 24c-15 0-26 11-26 24s11 24 26 24c7 0 11-4 11-9 0-6-8-8-8-15s8-9 8-15c0-5-4-9-11-9z"/><path d="M50 48h10"/>'],
  Neurology: ['#4F46E5', '#818CF8', '<path d="M48 28v40M48 30c-8-6-18 0-16 8-6 2-6 12 0 14-2 8 6 14 16 10M48 30c8-6 18 0 16 8 6 2 6 12 0 14 2 8-6 14-16 10M40 40h-6M56 40h6M40 56h-6M56 56h6"/>'],
  Oncology: ['#A855F7', '#C084FC', '<path d="M40 72l12-26M56 72L44 46"/><path d="M44 46c-6-4-8-11-4-15s11-3 14 2c2 5 0 10-4 13z"/>'],
  Ophthalmology: ['#0284C7', '#38BDF8', '<path d="M20 48c8-12 17-18 28-18s20 6 28 18c-8 12-17 18-28 18s-20-6-28-18M48 40a8 8 0 1 1 0 16 8 8 0 0 1 0-16"/>'],
  'Pain Palliative': ['#E11D48', '#FB7185', '<path d="M48 40c-4-8-16-8-18 2-2 8 6 16 18 24 12-8 20-16 18-24-2-10-14-10-18-2z"/>'],
  Pharmacology: ['#1D4ED8', '#60A5FA', '<g transform="rotate(-45 48 48)"><rect x="24" y="38" width="48" height="20" rx="10"/><path d="M48 38v20"/></g>'],
  Physiology: ['#059669', '#34D399', '<path d="M22 48h12l6-14 8 30 8-22 5 6h13"/>'],
  Psychiatry: ['#7E22CE', '#A855F7', '<path d="M58 72V60c7-4 12-11 12-19 0-12-10-21-22-21S26 29 26 41c0 6 2 11 6 14v9h8"/><circle cx="41" cy="40" r="2.2"/><circle cx="49" cy="40" r="2.2"/><circle cx="57" cy="40" r="2.2"/>'],
  'Research Methods': ['#0F766E', '#14B8A6', '<path d="M44 28a16 16 0 1 1 0 32 16 16 0 0 1 0-32M56 56l14 14M38 44h12M44 38v12"/>'],
  Respiratory: ['#DB2777', '#F472B6', '<path d="M48 24v26M48 36c-4-4-10-6-14-2-5 5-6 16-6 24 0 6 4 10 10 10 4 0 8-3 9-8l1-14M48 36c4-4 10-6 14-2 5 5 6 16 6 24 0 6-4 10-10 10-4 0-8-3-9-8l-1-14"/>'],
  Rheumatology: ['#B45309', '#F59E0B', '<circle cx="48" cy="48" r="9"/><path d="M28 28l13 13M55 55l13 13M25 37l3-12 12-3M71 59l-3 12-12 3"/>'],
  Safeguarding: ['#15803D', '#4ADE80', '<path d="M48 24l20 8v18c0 14-9 22-20 26-11-4-20-12-20-26V32zM48 44c-3-5-10-4-11 2-1 5 5 10 11 14 6-4 12-9 11-14-1-6-8-7-11-2z"/>'],
  'RCPCH Specimen': ['#334155', '#64748B', '<path d="M40 22v38a10 10 0 0 0 20 0V22M36 22h28M40 48h20"/>'],
  Specimen: ['#475569', '#94A3B8', '<path d="M40 22v38a10 10 0 0 0 20 0V22M36 22h28M40 48h20"/>'],
  'Clinical Cases': ['#0369A1', '#38BDF8', '<path d="M34 34h28a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H34a4 4 0 0 1-4-4V38a4 4 0 0 1 4-4M40 34v-6h16v6M48 46v14M41 53h14"/>'],
  // Survival guide chapter titles. Where a subject already has a glyph under a
  // shorter name, the same drawing is reused so one subject looks the same in
  // every book.
  Cardiology: ['#E11D48', '#F43F5E', '<path d="M48 70C30 58 24 48 24 40c0-8 6-14 13-14 5 0 9 3 11 7 2-4 6-7 11-7 7 0 13 6 13 14 0 8-6 18-24 30z"/><path d="M30 48h10l4-8 6 14 4-6h12"/>'],
  Gastroenterology: ['#F97316', '#FB923C', '<path d="M40 22v12c0 5-10 6-10 18 0 13 10 22 21 22 10 0 17-7 17-15 0-9-7-13-14-13h-5"/>'],
  Endocrinology: ['#EC4899', '#F472B6', '<path d="M48 38v24M48 40c-3-6-11-8-16-4s-5 15 0 19 13 2 16-4M48 40c3-6 11-8 16-4s5 15 0 19-13 2-16-4M36 26h24"/>'],
  'Metabolic diseases': ['#06B6D4', '#22D3EE', '<path d="M48 30a7 7 0 1 1 0 14 7 7 0 0 1 0-14M32 58a7 7 0 1 1 0 14 7 7 0 0 1 0-14M64 58a7 7 0 1 1 0 14 7 7 0 0 1 0-14M44 42L36 56M52 42l8 14M39 66h18"/>'],
  'Vision and hearing': ['#0284C7', '#38BDF8', '<path d="M18 44c7-10 15-15 24-15s17 5 24 15c-7 10-15 15-24 15s-17-5-24-15M42 37a7 7 0 1 1 0 14 7 7 0 0 1 0-14M72 56c4 3 4 9 0 12M78 51c7 6 7 16 0 22"/>'],
  'Paediatric syndromes': ['#7C3AED', '#A78BFA', '<path d="M36 24c0 10 6 16 6 24s-6 14-6 24M44 24c0 10-6 16-6 24s6 14 6 24M56 24c0 10 6 16 6 24s-6 14-6 24M64 24c0 10-6 16-6 24s6 14 6 24"/>'],
  'Paediatric development': ['#16A34A', '#4ADE80', '<path d="M26 70V58h12v12M42 70V46h12v24M58 70V32h12v38"/><path d="M64 24a4 4 0 1 1 0 .1"/>'],
  'The long case': ['#0369A1', '#38BDF8', '<path d="M34 30h28a4 4 0 0 1 4 4v34a4 4 0 0 1-4 4H34a4 4 0 0 1-4-4V34a4 4 0 0 1 4-4M40 30v-6h16v6M38 44h20M38 52h20M38 60h12"/>'],
};

/** The SVG for one subject, or null if it has no glyph. */
export function subjectSvg(name) {
  const entry = SUBJECTS[name];
  if (!entry) return null;
  const [from, to, glyph] = entry;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">',
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>`,
    '</linearGradient></defs>',
    '<rect width="96" height="96" rx="22" fill="url(#g)"/>',
    '<circle cx="80" cy="82" r="16" fill="#ffffff" opacity="0.10"/>',
    '<circle cx="18" cy="16" r="10" fill="#ffffff" opacity="0.10"/>',
    '<g fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">',
    glyph,
    '</g>',
    '</svg>',
  ].join('');
}

/** A data URI, which is what the deck and quiz records store in `img`. */
export function subjectIcon(name) {
  const svg = subjectSvg(name);
  return svg ? `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}` : null;
}

export const SUBJECT_NAMES = Object.keys(SUBJECTS);
