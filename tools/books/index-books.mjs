// Indexes textbook PDFs for the AI helper's "From my textbooks" mode
// (functions/books.js reads what this writes).
//
//   cd tools/books && npm install                     once
//   set GEMINI_API_KEY=...                            (PowerShell: $env:GEMINI_API_KEY="...")
//   node index-books.mjs <book.pdf | folder>          dry run: pages, passages, time
//   node index-books.mjs <book.pdf | folder> --commit embed and upload
//   node index-books.mjs --list                       books already indexed
//   node index-books.mjs --remove <id>                take one out
//
// Each PDF is split into ~250-word passages (with a little overlap, so a fact
// on a boundary is not lost), each passage remembers the page it starts on,
// and Gemini turns each into a vector. The free Gemini tier allows about
// 30,000 tokens a minute, so a 1,500-page book takes roughly an hour; the
// script paces itself, and an interrupted run picks up where it stopped
// (progress is kept in .cache/). Uploading uses the Firebase CLI you are
// signed in to, like the scripts in ../../scripts.
//
// The PDFs must have real text (you can select words in them). Scanned
// pages have none and are reported, not indexed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Must match functions/books.js.
const EMBED_MODEL = 'gemini-embedding-001';
const DIMS = 512;

const PROJECT = 'easy-pedia';
const WORDS = 250;
const OVERLAP = 50;
const PART_ROWS = 2000; // vectors per stored string, to keep each well under the database's 10 MB
const TPM = 25_000; // stay under the free tier's 30,000 tokens a minute
const BATCH_TOKENS = 20_000;
const BATCH_MAX = 100;
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CACHE = path.join(HERE, '.cache');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const commit = flag('--commit');

const fb = (a) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return execFileSync('firebase', [...a, '--project', PROJECT], {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
        shell: true,
      });
    } catch (e) {
      // The CLI now and then fails to look up the database instance; a retry clears it.
      if (attempt >= 4) throw e;
    }
  }
};

const slug = (s) =>
  s.toLowerCase().replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'book';
const tokensOf = (text) => Math.ceil(text.split(/\s+/).length * 1.4);

// ------------------------------------------------------------------ PDF
async function readPdf(file) {
  const task = getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  const meta = await doc.getMetadata().catch(() => ({}));
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const text = items
      .map((it) => it.str + (it.hasEOL ? '\n' : ' '))
      .join('')
      .replace(/(\w)-\n(\w)/g, '$1$2') // words hyphenated across lines
      .replace(/\s+/g, ' ')
      .trim();
    pages.push(text);
    page.cleanup();
  }
  await task.destroy();
  return { title: String(meta?.info?.Title || '').trim(), pages };
}

/** ~WORDS-word passages; `p` is the page a passage starts on (1-based). */
function chunk(pages) {
  const words = [];
  pages.forEach((text, i) => text && text.split(' ').forEach((w) => words.push([w, i + 1])));
  const out = [];
  for (let start = 0; start < words.length; start += WORDS - OVERLAP) {
    const slice = words.slice(start, start + WORDS);
    if (slice.length < 30 && out.length) break; // a scrap at the very end
    out.push({ p: slice[0][1], t: slice.map((w) => w[0]).join(' ') });
    if (start + WORDS >= words.length) break;
  }
  return out;
}

// ----------------------------------------------------------- embeddings
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let windowStart = Date.now();
let windowTokens = 0;

async function embedBatch(texts, key) {
  const tokens = texts.reduce((n, t) => n + tokensOf(t), 0);
  if (Date.now() - windowStart > 60_000) {
    windowStart = Date.now();
    windowTokens = 0;
  }
  if (windowTokens + tokens > TPM) {
    await sleep(60_000 - (Date.now() - windowStart) + 500);
    windowStart = Date.now();
    windowTokens = 0;
  }
  windowTokens += tokens;

  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: DIMS,
        })),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j.embeddings.map((e) => e.values);
    const msg = j?.error?.message || `HTTP ${r.status}`;
    if (r.status === 429 && /per day|PerDay/i.test(msg)) {
      throw new Error(`Today's free embedding quota is used up. Run the same command again tomorrow; it carries on. (${msg})`);
    }
    if ([429, 500, 503].includes(r.status) && attempt < 8) {
      const wait = Math.min(60_000, 5_000 * 2 ** attempt);
      console.log(`  Gemini ${r.status}, waiting ${wait / 1000}s…`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Gemini embedding failed: ${msg}`);
  }
}

/** Int8 rows plus one float scale per row (value ≈ q * scale), from unit vectors. */
function quantize(vectors) {
  const rows = new Int8Array(vectors.length * DIMS);
  const scales = new Float32Array(vectors.length);
  vectors.forEach((v, i) => {
    const norm = Math.hypot(...v) || 1;
    const max = Math.max(...v.map((x) => Math.abs(x / norm))) || 1;
    scales[i] = max / 127;
    for (let d = 0; d < DIMS; d++) rows[i * DIMS + d] = Math.round((v[d] / norm / max) * 127);
  });
  return { rows, scales };
}

const b64Parts = (typed, rowBytes) => {
  const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  const step = PART_ROWS * rowBytes;
  const parts = [];
  for (let o = 0; o < buf.length; o += step) parts.push(buf.subarray(o, o + step).toString('base64'));
  return parts;
};

// ----------------------------------------------------------------- main
async function indexBook(file, key) {
  const { title: pdfTitle, pages } = await readPdf(file);
  const id = slug(path.basename(file));
  const title = (pdfTitle.length > 3 ? pdfTitle : path.basename(file).replace(/\.pdf$/i, '')).slice(0, 120);
  const empty = pages.filter((t) => t.length < 20).length;
  const chunks = chunk(pages);
  const tokens = chunks.reduce((n, c) => n + tokensOf(c.t), 0);

  console.log(`\n${path.basename(file)}`);
  console.log(`  id "${id}", title "${title}"`);
  console.log(`  ${pages.length} pages (${empty} with no text${empty > pages.length / 3 ? ' — looks scanned, needs OCR first' : ''})`);
  console.log(`  ${chunks.length} passages, ~${Math.round(tokens / 1000)}K tokens, ~${Math.ceil(tokens / TPM)} min on the free tier`);
  if (!commit || !chunks.length) return;

  // Progress so far: one JSON line per finished batch, so a rerun skips them.
  fs.mkdirSync(CACHE, { recursive: true });
  const progressFile = path.join(CACHE, `${id}.jsonl`);
  const vectors = fs.existsSync(progressFile)
    ? fs.readFileSync(progressFile, 'utf8').split('\n').filter(Boolean).flatMap((l) => JSON.parse(l))
    : [];
  if (vectors.length) console.log(`  carrying on: ${Math.min(vectors.length, chunks.length)} of ${chunks.length} already embedded`);

  while (vectors.length < chunks.length) {
    const batch = [];
    let t = 0;
    for (let i = vectors.length; i < chunks.length && batch.length < BATCH_MAX; i++) {
      t += tokensOf(chunks[i].t);
      if (batch.length && t > BATCH_TOKENS) break;
      batch.push(chunks[i].t);
    }
    const got = await embedBatch(batch, key);
    fs.appendFileSync(progressFile, `${JSON.stringify(got)}\n`);
    vectors.push(...got);
    process.stdout.write(`\r  embedded ${vectors.length}/${chunks.length}`);
  }
  console.log('');

  const { rows, scales } = quantize(vectors.slice(0, chunks.length));
  const tmp = path.join(CACHE, `${id}-upload`);
  fs.mkdirSync(tmp, { recursive: true });
  const write = (name, value) => {
    const f = path.join(tmp, `${name}.json`);
    fs.writeFileSync(f, JSON.stringify(value));
    return f;
  };
  console.log('  uploading…');
  fb(['database:set', `/books/chunks/${id}`, write('chunks', chunks), '--force']);
  fb(['database:set', `/books/vectors/${id}`, write('vectors', { parts: b64Parts(rows, DIMS), scales: b64Parts(scales, 4) }), '--force']);
  // The list goes last: the function only uses a book once it is listed.
  fb(['database:set', `/books/list/${id}`, write('meta', {
    title, file: path.basename(file), pages: pages.length, chunks: chunks.length, dims: DIMS, model: EMBED_MODEL, addedAt: Date.now(),
  }), '--force']);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(progressFile, { force: true });
  console.log(`  done: "${title}" is searchable.`);
}

if (flag('--list')) {
  const list = JSON.parse(fb(['database:get', '/books/list']) || 'null') || {};
  const rows = Object.entries(list);
  if (!rows.length) console.log('No books indexed yet.');
  rows.forEach(([id, b]) => console.log(`${id}  "${b.title}"  ${b.pages} pages, ${b.chunks} passages`));
} else if (flag('--remove')) {
  const id = args[args.indexOf('--remove') + 1];
  if (!id) throw new Error('Usage: node index-books.mjs --remove <id>  (ids from --list)');
  fb(['database:remove', `/books/list/${id}`, '--force']);
  fb(['database:remove', `/books/vectors/${id}`, '--force']);
  fb(['database:remove', `/books/chunks/${id}`, '--force']);
  console.log(`Removed ${id}.`);
} else {
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) {
    console.error('Usage: node index-books.mjs <book.pdf | folder> [--commit]   (or --list, --remove <id>)');
    process.exit(1);
  }
  const files = fs.statSync(target).isDirectory()
    ? fs.readdirSync(target).filter((f) => /\.pdf$/i.test(f)).map((f) => path.join(target, f))
    : [target];
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (commit && !key) throw new Error('Set GEMINI_API_KEY first (the same key as the app, from aistudio.google.com/apikey).');
  for (const f of files) await indexBook(f, key);
  if (!commit) console.log('\nDry run. Add --commit to embed and upload.');
}
