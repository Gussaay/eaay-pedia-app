// Assembles the Survival guide upload folder.
//
// Each chapter gets one workbook with Flashcards and MCQs side by side, so the
// app's two importers each pick their own sheet by column signature. One master
// ALL-DECKS workbook creates every deck in a single atomic import.
//
//   node scripts/assemble-survival.mjs <out folder> <folder of built csv/xlsx>
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

const OUT = process.argv[2];
const SRC = process.argv[3];

const SUBJECTS = [
  ['Genetics', 'Inheritance patterns, chromosomal disorders, imprinting, trinucleotide repeats, mitochondrial inheritance and genetic counselling.'],
  ['Cardiology', 'Fetal circulation, congenital heart disease, murmurs, ECG and chest X-ray interpretation, cardiomyopathy, arrhythmias and heart failure.'],
  ['Respiratory', 'Respiratory physiology, lung function, asthma, cystic fibrosis, infections, upper airway disorders and chest radiology.'],
  ['Nephrology', 'Renal physiology, acid-base, tubular disorders, nephrotic and nephritic syndromes, renal failure, urinary tract infection and hypertension.'],
  ['Neurology', 'Neuroanatomy, seizures, cerebral palsy, neuromuscular disease, neurocutaneous syndromes, headache, CSF and neuroimaging.'],
  ['Gastroenterology', 'Malabsorption, coeliac disease, inflammatory bowel disease, liver disease, neonatal jaundice and surgical gastroenterology.'],
  ['Endocrinology', 'Growth, puberty, thyroid, adrenal, pituitary and calcium disorders, diabetes, intersex and endocrine tests.'],
  ['Haematology', 'Haemopoiesis, anaemias, haemoglobinopathies, haemolysis, coagulation and platelet disorders, transfusion and haematological radiology.'],
  ['Immunology', 'Immunoglobulins, primary immunodeficiencies, complement, hereditary angio-oedema, immunological investigation and paediatric HIV.'],
  ['Metabolic diseases', 'Electrolytes, inborn errors of metabolism, storage disorders, rickets, porphyrias, acid-base, hyperlipidaemia and poisoning.'],
  ['Rheumatology', 'Causes of arthritis, juvenile chronic arthritis, the limping child, bone tumours, orthopaedic radiology, connective tissue disease, Kawasaki disease and NAI.'],
  ['Dermatology', 'Eczema, psoriasis, birthmarks, infections and infestations, bullous disorders, genodermatoses and the viral exanthems.'],
  ['Vision and hearing', 'Ptosis, proptosis, fundal and lens abnormalities, uveitis, leukocoria, deafness, tympanograms, audiograms and tuning fork tests.'],
  ['Paediatric syndromes', 'Chromosomal, overgrowth, craniofacial, skeletal and neurodevelopmental syndromes with their key distinguishing features.'],
  ['Paediatric development', 'Primitive reflexes, developmental milestones in every domain, autism, speech delay and the developmental short case.'],
  ['The long case', 'How to take, examine and present a paediatric long case, with the history headings examiners expect.'],
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

SUBJECTS.forEach(([title, about], subjectIndex) => {
  const cards = csv(path.join(SRC, `Surv-${title}-cards.csv`));
  const mcqs = read(path.join(SRC, `Surv-${title}-mcqs.xlsx`));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cards), 'Flashcards');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mcqs), 'MCQs');
  XLSX.writeFile(wb, path.join(OUT, `Surv-${title}.xlsx`));

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

const master = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(master, XLSX.utils.json_to_sheet(allDecks), 'Flashcards');
XLSX.writeFile(master, path.join(OUT, 'Survival-ALL-DECKS.xlsx'));

let cardTotal = 0;
let qTotal = 0;
console.log('  chapter                   cards   questions');
for (const [t, c, q] of report) {
  cardTotal += c;
  qTotal += q;
  console.log(`  ${t.padEnd(24)} ${String(c).padStart(5)} ${String(q).padStart(11)}`);
}
console.log(`  ${'TOTAL'.padEnd(24)} ${String(cardTotal).padStart(5)} ${String(qTotal).padStart(11)}`);
console.log(`\nWrote ${SUBJECTS.length + 1} files to ${OUT}`);
