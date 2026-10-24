// Which question bank (main_category, e.g. "mrcpch") a book source belongs to,
// and the group inside it (lib/bookGroups.js). The mcqs list is tiny, so it is
// read once per session.
import { getList } from './rtdb';

let books = null;

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
