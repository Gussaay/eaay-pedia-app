// Which question bank (main_category, e.g. "mrcpch") a book source belongs to,
// and the group inside it (lib/bookGroups.js). The mcqs list is tiny, so it is
// read once per session.
import { getList } from './rtdb';

let books = null;
let banks = null;

/** The book's mcqs record, or null. */
export async function bookOfSource(source) {
  books ||= getList('mcqs').catch((e) => {
    books = null;
    throw e;
  });
  return (await books).find((b) => b.source === source) || null;
}

export async function bankOfSource(source) {
  return (await bookOfSource(source))?.main_category || '';
}

/** { bank, group } of a book, for the access check (lib/access.js). */
export async function placeOfSource(source) {
  const b = await bookOfSource(source);
  return { bank: b?.main_category || '', group: String(b?.group || '').trim() };
}

const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/**
 * Where a question comes from, as titles from the bank down to the paper:
 * ["MRCPCH", "FOP", "FOP Recalls", "2024"]. A part that repeats the one
 * before it is left out.
 */
export async function sourcePath(q) {
  const book = await bookOfSource(q?.source).catch(() => null);
  banks ||= getList('main_category').catch((e) => {
    banks = null;
    throw e;
  });
  const bank = book ? (await banks.catch(() => [])).find((c) => c.source === book.main_category) : null;
  const group = String(book?.group || '').trim();
  const parts = [
    bank?.title || book?.main_category,
    group && (bank?.groups?.[group]?.title || group),
    book?.title,
    q?.title || q?.quiztitle,
  ].map(clean);
  return parts.filter((t, i) => t && t.toLowerCase() !== parts[i - 1]?.toLowerCase());
}
