// Creating whole DECKS from a spreadsheet, not just cards inside one.
//
// Adding a deck by hand means typing a title, a system, a topic and picking an
// image, then opening the deck and uploading its cards — four screens per
// deck. For one deck that is fine. For a whole exam's worth it is an evening's
// typing, and every retyped system name is a chance to split "Cardiology" from
// "cardiology" on the gaps screen.
//
// So the sheet carries the deck's own details alongside its cards. A `deck`
// column (or one sheet per deck) says which deck a row belongs to, and the
// deck-level columns - system, topic, about, image_url, order - are read from
// the first row that has them. Everything is then written in ONE atomic call.
//
// Pure logic (no React, no Firebase) so it can be unit-tested: npm test.
import { fieldForHeader, parseCardRows } from './flashcardImport.js';

/** Deck-level columns. The card parser already maps most of these. */
const DECK_ALIASES = {
  deckimage: 'img',
  deckimg: 'img',
  deckpicture: 'img',
  deckimageurl: 'img',
  coverimage: 'img',
  cover: 'img',
  decktopic: 'topic',
  deckabout: 'about',
  about: 'about',
  description: 'about',
  summary: 'about',
  deckorder: 'order',
  order: 'order',
  sort: 'order',
  position: 'order',
  publish: 'publish',
  published: 'publish',
};

const normalize = (h) =>
  String(h || '')
    .toLowerCase()
    .replace(/[\s_\-.()]/g, '')
    .trim();

const clean = (v) => (v === undefined || v === null ? '' : String(v).replace(/\r/g, '').trim());

/** Deck-level value from a raw row: about/image/order/publish, plus topic. */
export function deckFieldsOf(rawRow) {
  const out = {};
  Object.entries(rawRow || {}).forEach(([header, value]) => {
    const key = DECK_ALIASES[normalize(header)];
    if (key && out[key] === undefined && clean(value) !== '') out[key] = clean(value);
  });
  return out;
}

/**
 * The deck a row belongs to.
 *
 * A `deck` column wins, because a workbook may keep every card on one sheet.
 * Failing that the sheet's own name is the deck title, which is how most
 * people naturally organise a workbook - one tab per deck.
 */
export const deckNameOf = (item, rawRow, sheetName) =>
  clean(item?.deckFromFile) || clean(rawRow?.deck) || clean(sheetName) || '';

const compareTitle = (t) =>
  clean(t)
    .toLowerCase()
    .replace(/\s+/g, ' ');

/**
 * Turns sheets into deck plans.
 *
 * `sheets` is [{ name, rows }] - the same shape the sheet picker returns.
 * `existingDecks` is what is already in this book, so a title that is already
 * there is flagged rather than silently duplicated.
 *
 * Returns { decks, unknownHeaders, skipped }, each deck being
 *   { title, system, topic, about, img, order, publish, items, existing }
 * where `items` are parsed cards ready for buildCardRecord.
 */
export function planDecks(sheets, { existingDecks = [] } = {}) {
  const byTitle = new Map();
  const unknownHeaders = new Set();
  let skipped = 0;

  const existingByTitle = new Map(
    existingDecks.filter((d) => d?.title).map((d) => [compareTitle(d.title), d]),
  );

  (sheets || []).forEach(({ name, rows }) => {
    if (!rows || !rows.length) return;
    // Cards are parsed with the existing card parser, so every alias and every
    // validation rule stays in one place.
    const parsed = parseCardRows(rows, {});
    parsed.unknownHeaders.forEach((h) => {
      // A deck-level column is not "unknown" here, even though the card parser
      // does not recognise it.
      if (!DECK_ALIASES[normalize(h)]) unknownHeaders.add(h);
    });
    skipped += parsed.skipped;

    parsed.items.forEach((item, i) => {
      const raw = rows[i] || {};
      const title = deckNameOf(item, raw, name);
      if (!title) return;
      const cmp = compareTitle(title);
      if (!byTitle.has(cmp)) {
        byTitle.set(cmp, {
          title,
          system: '',
          topic: '',
          about: '',
          img: '',
          order: '',
          publish: true,
          items: [],
          existing: existingByTitle.get(cmp) || null,
        });
      }
      const deck = byTitle.get(cmp);

      // Deck-level details come from the first row that carries them, so they
      // need only be filled in once per deck rather than repeated on every row.
      const fields = deckFieldsOf(raw);
      if (!deck.system && item.systemFromFile) deck.system = item.systemFromFile;
      // A plain "topic" column means the card's CHAPTER, so the deck's own
      // topic needs its own column name - deck_topic.
      if (!deck.topic && fields.topic) deck.topic = fields.topic;
      if (!deck.about && fields.about) deck.about = fields.about;
      if (!deck.img && fields.img) deck.img = fields.img;
      if (!deck.order && fields.order) deck.order = fields.order;
      if (fields.publish !== undefined) deck.publish = !/^(false|no|0|hidden)$/i.test(fields.publish);

      deck.items.push(item);
    });
  });

  // Inside a deck, duplicate fronts are only duplicates of each other; the
  // card parser compared them across the whole sheet, which for a multi-deck
  // workbook is the wrong scope.
  const decks = [...byTitle.values()].map((deck) => {
    const seen = new Map();
    const items = deck.items.map((item) => {
      const fp = compareTitle(item.record.front);
      let duplicate = null;
      if (fp && seen.has(fp)) duplicate = `same as row ${seen.get(fp)}`;
      else if (fp) seen.set(fp, item.row);
      return { ...item, duplicate };
    });
    return { ...deck, items, order: deck.order === '' ? '' : deck.order };
  });

  return { decks, unknownHeaders: [...unknownHeaders], skipped };
}

/** What is written to flashdecks/<key>. */
export const buildDeckRecord = (deck, { key, source, count }) => ({
  key,
  source,
  title: deck.title,
  system: deck.system || '',
  topic: deck.topic || '',
  img: deck.img || '',
  about: deck.about || '',
  order: Number.parseInt(deck.order, 10) || 0,
  publish: deck.publish !== false,
  count,
  created: new Date().toISOString().slice(0, 10),
});

/** Decks that are worth writing: at least one importable card. */
export const usableDecks = (decks, { includeExisting = false } = {}) =>
  (decks || []).filter(
    (d) => (includeExisting || !d.existing) && d.items.some((i) => i.errors.length === 0 && !i.duplicate),
  );

export const DECK_TEMPLATE_HEADERS = [
  'deck',
  'system',
  'deck_image',
  'about',
  'order',
  'front',
  'back',
  'chapter',
  'hint',
  'note',
  'tags',
];

export const DECK_TEMPLATE_EXAMPLE = [
  'Congenital heart disease',
  'Cardiology',
  'https://example.com/cover.png',
  'Cyanotic and acyanotic lesions from the 2020 papers.',
  '1',
  'Most common cyanotic congenital heart lesion',
  'Tetralogy of Fallot',
  'Cyanotic lesions',
  'Four features, remember PROVe',
  'Pulmonary stenosis, RVH, Overriding aorta, VSD.',
  'cardiology, cyanosis',
];

/** CSV text for the downloadable template (BOM so Excel keeps UTF-8). */
export function deckTemplateCsv() {
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return `﻿${DECK_TEMPLATE_HEADERS.join(',')}\n${DECK_TEMPLATE_EXAMPLE.map(escape).join(',')}\n`;
}

export { fieldForHeader };
