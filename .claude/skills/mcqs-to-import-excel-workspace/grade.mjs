// Grades each run's outputs against its eval_metadata.json assertions.
// Everything checkable is computed from the produced file itself; the two
// judgement-based assertions are left for the human/manual pass.
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { parseRows, importableItems } from '../../../src/lib/questionImport.js';

const ITER = process.argv[2];
const KEYS = ['a', 'b', 'c', 'd', 'e'];
// Chapter names exactly as stored in the app's database.
const CHAPTERS = ['CNS','Child Health','Dermatology','ENT','Emergencies','Endocrinology','GIT','Growth and Development','Haematology','Immunology','Neonatology','Pediatric Drugs','Respiratory','Rhumatology','vaccination','cardiology','genetics','infectious disease','mdical statistics','metabolic disease','nephrology','nutrition','oncology','pediatric surgery','urology'];

const readSheet = (file) => {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
};

function analyse(dir) {
  const outDir = path.join(dir, 'outputs');
  if (!fs.existsSync(outDir)) return null;
  const files = fs.readdirSync(outDir);
  const sheetFile = files.find((f) => /\.xlsx$/i.test(f)) || files.find((f) => /\.csv$/i.test(f));
  const text = files
    .filter((f) => /\.(md|txt)$/i.test(f))
    .map((f) => fs.readFileSync(path.join(outDir, f), 'utf8'))
    .join('\n');
  if (!sheetFile) return { files, text, rows: null };
  const raw = readSheet(path.join(outDir, sheetFile));
  const parsed = parseRows(raw);
  const norm = raw.map((r) => {
    const o = {};
    Object.entries(r).forEach(([k, v]) => { o[String(k).toLowerCase().replace(/[\s_]/g, '')] = String(v ?? '').trim(); });
    return o;
  });
  return { files, text, sheetFile, raw, norm, parsed,
    ready: importableItems(parsed.items).length,
    errors: parsed.items.filter((i) => i.errors.length).length };
}

const hasImportColumns = (a) => {
  if (!a?.norm?.length) return [false, 'no spreadsheet produced'];
  const c = Object.keys(a.norm[0]);
  const need = ['question', 'a', 'b', 'answer'];
  const missing = need.filter((n) => !c.includes(n));
  return [missing.length === 0, `columns: ${c.join(', ')}`];
};
const answerSpread = (a) => {
  const t = {};
  a.parsed.items.forEach((i) => { t[i.record.answer] = (t[i.record.answer] || 0) + 1; });
  return t;
};
const categories = (a) => a.norm.map((r) => r.category1 ?? r.category ?? '').filter(Boolean);

const GRADERS = {
  0: (a) => {
    const spread = answerSpread(a);
    const top = Math.max(0, ...Object.values(spread));
    const cats = categories(a);
    const labelled = a.parsed.items.filter((i) => KEYS.some((k) => /^[a-e]\s*[).:-]\s+/i.test(i.record[k] || '')));
    const flagged = /q\s*4|uti|urinary/i.test(a.text) && /(wrong|incorrect|doubt|flag|check|excluded|held back|not includ|omitted|review)/i.test(a.text);
    return [
      hasImportColumns(a),
      [a.errors === 0, `${a.parsed.items.length} parsed, ${a.ready} ready, ${a.errors} rejected`],
      [a.parsed.items.every((i) => i.record[i.record.answer]), 'every answer letter points at a non-empty option'],
      [a.parsed.items.length + (flagged ? 1 : 0) >= 6, `${a.parsed.items.length} rows in file`],
      [flagged, flagged ? 'response mentions the doubtful UTI answer' : 'no mention of the flagged Q4 answer key'],
      [labelled.length === 0, labelled.length ? `${labelled.length} rows keep "A)" labels` : 'no leftover option labels'],
      [cats.length > 0 && cats.every((c) => CHAPTERS.includes(c)), `categories: ${[...new Set(cats)].join(', ') || 'none'}`],
      [a.parsed.items.length <= 4 || top / a.parsed.items.length <= 0.6, `answer spread ${JSON.stringify(spread)}`],
    ];
  },
  1: (a) => {
    const spread = answerSpread(a);
    const top = Math.max(0, ...Object.values(spread));
    const n = a.parsed.items.length;
    const cats = categories(a);
    const five = a.parsed.items.filter((i) => KEYS.every((k) => (i.record[k] || '').trim() !== ''));
    const exp = a.parsed.items.filter((i) => (i.record.exp || '').length >= 60);
    return [
      hasImportColumns(a),
      [a.errors === 0, `${n} parsed, ${a.ready} ready, ${a.errors} rejected`],
      [n === 15, `${n} questions`],
      [five.length === n, `${five.length}/${n} questions have 5 options`],
      [exp.length === n, `${exp.length}/${n} explanations >= 60 chars`],
      [n > 0 && top / n <= 0.45, `answer spread ${JSON.stringify(spread)}`],
      [cats.length > 0 && cats.every((c) => CHAPTERS.includes(c)), `categories: ${[...new Set(cats)].join(', ') || 'none'}`],
      [null, 'clinical accuracy - manual review'],
    ];
  },
  2: (a) => {
    const n = a.parsed.items.length;
    const cats = categories(a);
    const badCase = cats.filter((c) => !CHAPTERS.includes(c));
    const src = ['Drooling and a toxic appearance','Hypochloraemic hypokalaemic metabolic alkalosis','A non-blanching purpuric rash with prolonged capillary refill','Urgent investigation including full blood count, film and imaging','A 10-20 mL/kg bolus of 0.9% sodium chloride'];
    const correctText = a.parsed.items.map((i) => (i.record[i.record.answer] || '').replace(/\s+/g, ' ').trim());
    const matched = src.filter((t) => correctText.some((c) => c.toLowerCase().includes(t.toLowerCase().slice(0, 25))));
    const withExp = a.parsed.items.filter((i) => (i.record.exp || '').length > 30);
    const padded = a.parsed.items.filter((i) => /none of the above|n\/a|not applicable|^-$/i.test((i.record.e || '').trim()));
    return [
      hasImportColumns(a),
      [a.errors === 0, `${n} parsed, ${a.ready} ready, ${a.errors} rejected`],
      [n === 5, `${n} questions`],
      [matched.length === 5, `${matched.length}/5 rows keep the right correct-answer text under their letter`],
      [withExp.length === n, `${withExp.length}/${n} rows carry the rationale as explanation`],
      [badCase.length === 0, badCase.length ? `categories not matching app chapters: ${[...new Set(badCase)].join(', ')}` : `categories: ${[...new Set(cats)].join(', ')}`],
      [padded.length === 0, padded.length ? `${padded.length} rows padded option e` : 'no filler options'],
    ];
  },
};

for (const evalDir of fs.readdirSync(ITER).filter((d) => d.startsWith('eval-'))) {
  const meta = JSON.parse(fs.readFileSync(path.join(ITER, evalDir, 'eval_metadata.json'), 'utf8'));
  for (const run of ['with_skill', 'without_skill']) {
    const dir = path.join(ITER, evalDir, run);
    if (!fs.existsSync(dir)) continue;
    let results;
    try {
      const a = analyse(dir);
      results = a && a.norm ? GRADERS[meta.eval_id](a) : meta.assertions.map(() => [false, 'no usable output file']);
    } catch (e) {
      results = meta.assertions.map(() => [false, `grading error: ${e.message}`]);
    }
    const expectations = meta.assertions.map((as, i) => ({
      text: as.text,
      passed: results[i]?.[0] ?? null,
      evidence: String(results[i]?.[1] ?? ''),
    }));
    const auto = expectations.filter((e) => e.passed !== null);
    fs.writeFileSync(path.join(dir, 'grading.json'), JSON.stringify({
      eval_id: meta.eval_id, eval_name: meta.eval_name, run,
      passed: auto.filter((e) => e.passed).length, total: auto.length, expectations,
    }, null, 2));
    console.log(`${evalDir} ${run}: ${auto.filter((e) => e.passed).length}/${auto.length}`);
    expectations.filter((e) => e.passed === false).forEach((e) => console.log(`   FAIL ${e.text.slice(0, 60)} -> ${e.evidence.slice(0, 90)}`));
  }
}
