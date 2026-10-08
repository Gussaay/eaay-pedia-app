// Assembles the Philippa upload folder.
//
// Each subject gets one workbook with Flashcards and MCQs side by side, exactly
// like the TAS files, so the app's two importers each pick their own sheet by
// column signature. One master ALL-DECKS workbook creates every deck in a
// single atomic import.
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

const OUT = process.argv[2];
const SRC = process.argv[3];

const SUBJECTS = [
  ['Genetics', 'gen', 'Genetics and molecular medicine: nucleic acids, gene analysis, chromosomal and single-gene disorders, oncogenesis, apoptosis and the HLA system.'],
  ['Microbiology', 'mic', 'Bacteria, viruses, fungi and parasites, with antimicrobial chemotherapy, serology, immunization and sterilization.'],
  ['Immunology', 'imm', 'Innate and adaptive immunity, immunoglobulins, complement, hypersensitivity, immunodeficiency, autoimmunity, transplantation and immunological assays.'],
  ['Anatomy', 'ana', 'Peripheral and central nervous system, cranial nerves, principal vessels, head and neck, thorax and abdomen.'],
  ['Physiology', 'phy', 'Fluid and acid-base balance, renal, respiratory, cardiac, gastrointestinal and endocrine physiology, and the response to pregnancy.'],
  ['Biochemistry', 'bio', 'Cell biology and signalling, carbohydrate, lipid and protein metabolism, specialized proteins, vitamins, minerals, plasma proteins and enzymes.'],
  ['Statistics', 'sta', 'Descriptive statistics and distributions, hypothesis testing, study design, clinical trials, measures of effect, screening and health economics.'],
  ['Pharmacology', 'pha', 'Pharmacokinetics and pharmacogenetics, drug interactions, the major drug classes with their adverse effects, special risk groups, antidotes and drug-induced disease.'],
];

const read = (f) => {
  const wb = XLSX.read(fs.readFileSync(f), { type: 'buffer', raw: false });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
};
const csv = (f) => {
  const wb = XLSX.read(fs.readFileSync(f, 'utf8'), { type: 'string', raw: false });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
};

fs.mkdirSync(OUT, { recursive: true });
const allDecks = [];
const report = [];

SUBJECTS.forEach(([title, slug, about], subjectIndex) => {
  const cards = csv(path.join(SRC, `Phil-${titleFile(title)}-cards.csv`));
  const mcqs = read(path.join(SRC, `Phil-${titleFile(title)}-mcqs.xlsx`));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cards), 'Flashcards');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mcqs), 'MCQs');
  XLSX.writeFile(wb, path.join(OUT, `Philippa-${title}.xlsx`));

  // The master deck file: deck details on the first row of each block only.
  cards.forEach((c, i) => {
    allDecks.push(
      i === 0
        ? { deck: title, system: title, deck_topic: title, about, order: String(subjectIndex + 1), deck_image: '', ...c }
        : { deck: title, system: '', deck_topic: '', about: '', order: '', deck_image: '', ...c },
    );
  });
  report.push([title, cards.length, mcqs.length]);
});

function titleFile(t) {
  return t;
}

const master = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(master, XLSX.utils.json_to_sheet(allDecks), 'Flashcards');
XLSX.writeFile(master, path.join(OUT, 'Philippa-ALL-DECKS.xlsx'));

let cardTotal = 0;
let qTotal = 0;
console.log('  subject          cards   questions');
for (const [t, c, q] of report) {
  cardTotal += c;
  qTotal += q;
  console.log(`  ${t.padEnd(16)} ${String(c).padStart(5)} ${String(q).padStart(11)}`);
}
console.log(`  ${'TOTAL'.padEnd(16)} ${String(cardTotal).padStart(5)} ${String(qTotal).padStart(11)}`);
console.log(`\nWrote ${SUBJECTS.length + 1} files to ${OUT}`);
