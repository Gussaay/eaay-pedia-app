// "From my textbooks": finds the textbook passages closest to a question so
// the AI can answer from them and cite book and page.
//
// tools/books/index-books.mjs splits each PDF into passages on the admin's PC,
// embeds them with Gemini and uploads them here (Realtime Database):
//   books/list/<id>      { title, pages, chunks, dims, addedAt }
//   books/vectors/<id>   { parts: [base64 int8 rows], scales: [base64 float32] }
//   books/chunks/<id>/i  { p: page, t: text }
// Each passage vector is stored as int8 with its own scale (value = q * scale),
// which keeps a 6,000-passage book near 3 MB. Vectors are kept in memory
// between requests; passage text is read only for the few that are used.
//
// The two files must agree on EMBED_MODEL and DIMS.
import { logger } from 'firebase-functions';
import { getDatabase } from 'firebase-admin/database';

export const EMBED_MODEL = 'gemini-embedding-001';
export const DIMS = 512; // Gemini embeddings can be cut short; 512 keeps a cold start's download small

const cache = new Map(); // id -> { addedAt, n, rows: Int8Array, scales: Float32Array }

const decode = (parts, Type) => {
  const bufs = (parts || []).map((b) => Buffer.from(b, 'base64'));
  const all = Buffer.concat(bufs);
  const out = new Type(all.length / Type.BYTES_PER_ELEMENT);
  new Uint8Array(out.buffer).set(all);
  return out;
};

async function loadBooks() {
  const db = getDatabase();
  const list = (await db.ref('books/list').get()).val() || {};
  for (const id of cache.keys()) if (!list[id]) cache.delete(id);
  await Promise.all(
    Object.entries(list).map(async ([id, meta]) => {
      if (cache.get(id)?.addedAt === meta.addedAt) return;
      const v = (await db.ref(`books/vectors/${id}`).get()).val();
      if (!v || meta.dims !== DIMS) return;
      const rows = decode(Object.values(v.parts || {}), Int8Array);
      const scales = decode(Object.values(v.scales || {}), Float32Array);
      cache.set(id, { addedAt: meta.addedAt, title: meta.title, n: scales.length, rows, scales });
    }),
  );
  return list;
}

async function embedQuery(text, key) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: DIMS,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`embedding ${r.status}: ${j?.error?.message || ''}`);
  const v = Float32Array.from(j.embedding?.values || []);
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

/**
 * The `k` passages closest to `query`, best first:
 * [{ n, book, title, page, text, score }]. Empty when no book is indexed.
 */
export async function findPassages(query, key, k = 6) {
  await loadBooks();
  if (!cache.size) return [];
  const q = await embedQuery(query, key);

  const best = []; // [score, id, i], kept sorted and k long
  for (const [id, b] of cache) {
    for (let i = 0; i < b.n; i++) {
      let s = 0;
      const off = i * DIMS;
      for (let d = 0; d < DIMS; d++) s += b.rows[off + d] * q[d];
      s *= b.scales[i];
      if (best.length < k || s > best[best.length - 1][0]) {
        best.push([s, id, i]);
        best.sort((x, y) => y[0] - x[0]);
        if (best.length > k) best.pop();
      }
    }
  }

  const db = getDatabase();
  const hits = await Promise.all(
    best.map(async ([score, id, i]) => {
      const c = (await db.ref(`books/chunks/${id}/${i}`).get()).val();
      return c && { book: id, title: cache.get(id).title, page: c.p, text: c.t, score: Math.round(score * 1000) / 1000 };
    }),
  );
  const found = hits.filter(Boolean).map((h, i) => ({ n: i + 1, ...h }));
  logger.info(`books: ${found.length} passages, best ${found[0]?.score ?? '-'}`);
  return found;
}
