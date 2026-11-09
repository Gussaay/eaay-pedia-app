// Pure helpers for the OSPE image flashcards (ospe/cards/<id> in the database).
// No imports, so src/lib/ospe.test.js can check it without the functions'
// packages and the app can import it. The id (needs node:crypto) lives in
// ospeId.js.

export const OSPE_KINDS = [
  { key: 'skin', label: 'Skin' },
  { key: 'syndrome', label: 'Syndrome' },
  { key: 'xray', label: 'X-ray' },
  { key: 'ecg', label: 'ECG' },
  { key: 'micro', label: 'Microscopy' },
  { key: 'sign', label: 'Clinical sign' },
  { key: 'drawing', label: 'Drawing' },
  { key: 'other', label: 'Other' },
];

const KIND_KEYS = OSPE_KINDS.map((k) => k.key);
const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/**
 * Trim, and lowercase the scheme and host only. The path and query stay as they
 * are: a Firebase Storage link needs its ?alt=media&token= to be the same file.
 */
export function normalizeImgUrl(url) {
  const s = String(url ?? '').trim();
  const m = s.match(/^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)(.*)$/is);
  return m ? m[1].toLowerCase() + m[2].toLowerCase() + m[3] : s;
}

/** 'q~<qid>' for a question, 'c~<deck>~<card>' for a flashcard. */
export function srcKey(src) {
  return src?.type === 'card' ? `c~${src.deck}~${src.card}` : `q~${src?.qid}`;
}

/** The cards users can see (checked or auto, with a picture), by title. */
/**
 * OSPE shows real photographs only (owner's rule, 2026-11-09): our own
 * drawings (credit "Illustration: Easy Pedia" / "Easy Pedia drawing") and SVGs
 * stay out of the module, though they keep their place in the explanations.
 */
export function isDrawing(card) {
  return /easy pedia/i.test(String(card?.credit || '')) || card?.kind === 'drawing' || /\.svg(\?|$)/i.test(String(card?.img || ''));
}

/** First sentence of the caption: the short description on the back. */
export function shortCaption(caption) {
  const s = String(caption || '').trim();
  const m = s.match(/^.+?[.!?](?=\s|$)/);
  return (m ? m[0] : s).trim();
}

/** How many different exams (quizzes) the picture appears in. */
export function examCount(card) {
  const seen = new Set();
  for (const s of Object.values(card?.sources || {})) {
    if (s?.type === 'q') seen.add(s.quiz || s.label || s.qid);
  }
  return seen.size;
}

export function visibleCards(cardsObj) {
  return Object.entries(cardsObj || {})
    .filter(([, c]) => c && (c.status === 'checked' || c.status === 'auto') && c.img && !isDrawing(c))
    .map(([_key, c]) => ({ _key, ...c }))
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'en', { sensitivity: 'base' }) || (a._key < b._key ? -1 : a._key > b._key ? 1 : 0));
}

/** Cards grouped by system then topic, in the order of `chapters`; '' goes under 'Other'. */
export function groupBySystem(cards, chapters) {
  const known = new Set(chapters);
  const byChapter = new Map();
  for (const card of cards || []) {
    const chapter = known.has(card.chapter) ? card.chapter : 'Other';
    if (!byChapter.has(chapter)) byChapter.set(chapter, new Map());
    const topics = byChapter.get(chapter);
    const topic = card.topic || card.title || '';
    if (!topics.has(topic)) topics.set(topic, { topic, label: clean(card.topic_label) || card.title || topic, n: 0, cards: [] });
    const t = topics.get(topic);
    t.cards.push(card);
    t.n += 1;
  }
  const order = [...chapters.filter((c) => c !== 'Other'), 'Other'];
  return order
    .filter((c) => byChapter.has(c))
    .map((chapter) => {
      const topics = [...byChapter.get(chapter).values()].sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
      return { chapter, n: topics.reduce((s, t) => s + t.n, 0), topics };
    });
}

/** Adds one source to a card (a new waiting card when there is none). Never overwrites title, caption, credit or status. */
export function mergeSource(card, { src, img, field, chapter, topic, topic_label, now }) {
  const key = srcKey(src);
  if (!card) {
    return {
      img,
      title: '',
      caption: '',
      kind: 'other',
      chapter: chapter || '',
      topic: topic || '',
      topic_label: topic_label || '',
      credit: '',
      status: 'waiting',
      sources: { [key]: src },
      field,
      added: now,
      updated: now,
    };
  }
  return {
    ...card,
    chapter: card.chapter || chapter || '',
    topic: card.topic || topic || '',
    topic_label: card.topic_label || topic_label || '',
    sources: { ...(card.sources || {}), [key]: src },
    updated: now,
  };
}

/** Takes one source off a card; with none left the card is hidden (even if it was checked). */
export function removeSource(card, key, now) {
  const sources = { ...(card?.sources || {}) };
  delete sources[key];
  const out = { ...card, sources, updated: now };
  if (!Object.keys(sources).length) out.status = 'hidden';
  return out;
}

/** 'Bank › Group › Book › Quiz · Q5': blanks and repeats dropped, like sourcePath in banks.js. */
export function questionSourceLabel({ bank, group, book, quiz, n } = {}) {
  const parts = [bank, group, book, quiz].map(clean);
  const path = parts.filter((t, i) => t && t.toLowerCase() !== parts[i - 1]?.toLowerCase()).join(' › ');
  const q = n === undefined || n === null || clean(n) === '' ? '' : `Q${clean(n)}`;
  return [path, q].filter(Boolean).join(' · ');
}

const FIELD_WORDS = {
  exp_img: 'the explanation',
  question_img: 'the question',
  img: 'the question',
  back_img: 'the back of a flashcard',
};

/** The prompt that asks a model what a question's picture shows, from the question's own words. */
export function captionPrompt({ stem, answer, explanation, field } = {}) {
  const system = [
    'You write the label of a medical picture for an identification flashcard (OSPE).',
    "Describe ONLY what the question's own text says the picture shows. Never guess from general knowledge and never add findings the text does not mention.",
    'If the text does not say what the picture is, set "ok" to false and leave "title" and "caption" empty.',
    `Reply with JSON only: {"title": the diagnosis or finding, "caption": one or two short sentences of the features that identify it, "kind": one of ${KIND_KEYS.join(', ')}, "ok": true or false}.`,
  ].join('\n');
  const user = [
    `The picture is shown in ${FIELD_WORDS[field] || 'the question'}.`,
    `Question: ${clean(stem)}`,
    `Correct answer: ${clean(answer)}`,
    `Explanation: ${clean(explanation) || '(none)'}`,
  ].join('\n');
  return { system, user };
}

/** The model's reply as {title, caption, kind, ok}, or null if it is not that JSON. */
export function parseCaptionReply(text) {
  let s = String(text ?? '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  let obj;
  try {
    obj = JSON.parse(s);
  } catch {
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try {
      obj = JSON.parse(s.slice(a, b + 1));
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const kind = KIND_KEYS.includes(obj.kind) ? obj.kind : 'other';
  const title = clean(obj.title);
  let caption = clean(obj.caption);
  if (caption.length > 300) caption = `${caption.slice(0, 299).trimEnd()}…`;
  return { title, caption, kind, ok: obj.ok === true && !!title };
}
