#!/usr/bin/env node
// Builds an import-ready .xlsx/.csv question file for the Easy Pedia MCQs app.
//
//   node build_import_file.mjs --in a.json b.json --out ./my-quiz [--title "My quiz"]
//                              [--no-shuffle] [--seed 42] [--csv-only]
//
// Input: JSON array(s) of questions, either short form
//   {q, a, b, c, d, e, ans, exp, cat, cat2, img}
// or long form
//   {question, a..e, answer, explanation, category1, category2, explanation_image_url}
//
// Why this exists: hand-written banks reliably hit the same three problems — the correct
// option ends up first nearly every time, some answer keys point at an empty or missing
// option, and Excel mangles non-Latin text without a BOM. Catching those here means the
// admin's import preview shows zero bad rows.

import fs from 'node:fs';
import path from 'node:path';

const HEADERS = ['question', 'a', 'b', 'c', 'd', 'e', 'answer', 'explanation', 'category1', 'category2', 'explanation_image_url'];
const KEYS = ['a', 'b', 'c', 'd', 'e'];

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const flag = (name) => argv.includes(`--${name}`);

const inputs = (() => {
  const i = argv.indexOf('--in');
  if (i === -1) return [];
  const out = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j += 1) out.push(argv[j]);
  return out;
})();

if (!inputs.length || !opt('out')) {
  console.error('usage: build_import_file.mjs --in <file.json...> --out <path-without-extension> [--title T] [--no-shuffle] [--seed N] [--csv-only]');
  process.exit(2);
}

const outBase = opt('out').replace(/\.(xlsx|csv)$/i, '');
const title = opt('title', path.basename(outBase));
const shuffle = !flag('no-shuffle');
const seedArg = Number(opt('seed', '20260920'));

// ---------------------------------------------------------------- load
const clean = (v) => (v === undefined || v === null ? '' : String(v).replace(/\r/g, '').trim());

const raw = [];
for (const file of inputs) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(items)) {
    console.error(`${file}: expected a JSON array of questions`);
    process.exit(2);
  }
  items.forEach((it) => raw.push({ ...it, __file: path.basename(file) }));
  console.log(`read ${items.length.toString().padStart(4)}  ${path.basename(file)}`);
}

const normalised = raw.map((q) => ({
  question: clean(q.question ?? q.q),
  a: clean(q.a), b: clean(q.b), c: clean(q.c), d: clean(q.d), e: clean(q.e),
  answer: clean(q.answer ?? q.ans).toLowerCase().replace(/[^a-e]/g, ''),
  explanation: clean(q.explanation ?? q.exp),
  category1: clean(q.category1 ?? q.cat),
  category2: clean(q.category2 ?? q.cat2),
  explanation_image_url: clean(q.explanation_image_url ?? q.img),
  __file: q.__file,
}));

// ---------------------------------------------------------------- shuffle
// Seeded so a rebuild produces the same file; an unseeded shuffle would make
// every regeneration look like a content change.
let seed = Number.isFinite(seedArg) ? seedArg : 20260920;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const rows = normalised.map((q) => {
  if (!shuffle) return q;
  const correct = q[q.answer];
  const opts = KEYS.map((k) => q[k]).filter((v) => v !== '');
  if (!correct || opts.length < 2) return q; // leave broken rows for the validator to report
  for (let i = opts.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  const out = { ...q, a: '', b: '', c: '', d: '', e: '' };
  opts.forEach((text, i) => { out[KEYS[i]] = text; });
  out.answer = KEYS[opts.indexOf(correct)];
  return out;
});

// ---------------------------------------------------------------- validate
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.;:,]+$/, '').trim();
const problems = [];
const warnings = [];
const seen = new Map();

rows.forEach((r, i) => {
  const n = i + 1;
  const where = `row ${n}${r.__file ? ` (${r.__file})` : ''}`;
  const filled = KEYS.filter((k) => r[k] !== '');

  if (!r.question) problems.push(`${where}: no question text`);
  if (filled.length < 2) problems.push(`${where}: fewer than 2 options`);
  if (!r.answer) problems.push(`${where}: no correct answer given`);
  else if (!r[r.answer]) problems.push(`${where}: answer "${r.answer}" points at an empty option`);
  if (!r.category1) warnings.push(`${where}: no category`);
  if (!r.explanation) warnings.push(`${where}: no explanation`);
  else if (r.explanation.length < 60) warnings.push(`${where}: very short explanation`);
  if (filled.length === 2) warnings.push(`${where}: only 2 options`);

  const texts = filled.map((k) => norm(r[k]));
  if (new Set(texts).size !== texts.length) problems.push(`${where}: two options are identical`);

  // Options written as "a) text" in the source would show as "a) a) text" in the app.
  filled.forEach((k) => {
    if (/^[a-e]\s*[).:-]\s+/i.test(r[k])) warnings.push(`${where}: option ${k} still has an "a)" style label`);
  });

  const fp = norm(r.question);
  if (fp && seen.has(fp)) warnings.push(`${where}: same question as row ${seen.get(fp)}`);
  else if (fp) seen.set(fp, n);
});

// ---------------------------------------------------------------- report
const tally = (list) => {
  const m = {};
  list.forEach((v) => { m[v || '(none)'] = (m[v || '(none)'] || 0) + 1; });
  return Object.entries(m).sort((x, y) => y[1] - x[1]);
};

console.log(`\ntotal questions: ${rows.length}`);
console.log('answer spread  : ' + tally(rows.map((r) => r.answer)).map(([k, v]) => `${k}:${v}`).join('  '));
console.log('categories     : ' + tally(rows.map((r) => r.category1)).map(([k, v]) => `${k}:${v}`).join(', '));

const topAnswer = tally(rows.map((r) => r.answer))[0];
if (rows.length >= 10 && topAnswer && topAnswer[1] / rows.length > 0.45) {
  warnings.push(`answer "${topAnswer[0]}" is correct in ${Math.round((topAnswer[1] / rows.length) * 100)}% of questions — users will notice the pattern`);
}

if (warnings.length) {
  console.log(`\nwarnings (${warnings.length}) — the file still imports:`);
  warnings.slice(0, 25).forEach((w) => console.log('  ! ' + w));
  if (warnings.length > 25) console.log(`  … and ${warnings.length - 25} more`);
}
if (problems.length) {
  console.error(`\nPROBLEMS (${problems.length}) — these rows would be rejected by the import preview:`);
  problems.slice(0, 40).forEach((p) => console.error('  x ' + p));
  if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`);
  console.error('\nNothing was written. Fix the JSON and run again.');
  process.exit(1);
}

// ---------------------------------------------------------------- write
const outDir = path.dirname(path.resolve(outBase));
fs.mkdirSync(outDir, { recursive: true }); // writing into a folder that does not exist yet is normal

const csvEscape = (v) => `"${String(v).replace(/"/g, '""')}"`;
const csv = '﻿' + [HEADERS.join(','), ...rows.map((r) => HEADERS.map((h) => csvEscape(r[h] ?? '')).join(','))].join('\n') + '\n';
fs.writeFileSync(`${outBase}.csv`, csv, 'utf8'); // BOM: Excel needs it to read UTF-8 (Arabic, symbols)
console.log(`\nwrote ${outBase}.csv`);

if (!flag('csv-only')) {
  try {
    const XLSX = await import('xlsx');
    const data = rows.map((r) => Object.fromEntries(HEADERS.map((h) => [h, r[h] ?? ''])));
    const ws = XLSX.utils.json_to_sheet(data, { header: HEADERS });
    ws['!cols'] = [{ wch: 70 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 22 }, { wch: 8 }, { wch: 80 }, { wch: 20 }, { wch: 16 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');
    XLSX.writeFile(wb, `${outBase}.xlsx`);
    console.log(`wrote ${outBase}.xlsx  (sheet "Questions", title: ${title})`);
  } catch (e) {
    console.log(`note: no .xlsx written (${e.code === 'ERR_MODULE_NOT_FOUND' ? "the 'xlsx' package is not installed here" : e.message}).`);
    console.log('      The .csv imports just as well — or run from the app folder where xlsx is a dependency.');
  }
}
