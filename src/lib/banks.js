// Which question bank (main_category, e.g. "mrcpch") a book source belongs to.
// The mcqs list is tiny, so it is read once per session.
import { getList } from './rtdb';

let books = null;

export async function bankOfSource(source) {
  books ||= getList('mcqs').catch((e) => {
    books = null;
    throw e;
  });
  const hit = (await books).find((b) => b.source === source);
  return hit?.main_category || '';
}
