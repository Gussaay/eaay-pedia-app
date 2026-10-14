// Browsing MCQs the way mnemonics are browsed: by chapter, by basic science
// and by source (book), across a whole question bank or inside one book.
//
// Every quizqq record carries four extra fields, set by the batch script
// (.tmp/link/browse.mjs) and kept up to date when an admin saves a question:
//
//   chapter   one of CHAPTERS (the clinical system)
//   science   one of SECTIONS (Clinical, Anatomy, Physiology, Pharmacology…)
//   bchap     "<bank>|<chapter>"   indexed, so one chapter of one bank is one query
//   bsci      "<bank>|<science>"   the same for a basic-science section
//
// A bank is a main_category source (e.g. "mrcpch"); its books are the mcqs
// records with that main_category. qbrowse/<bank> holds the counts the
// browse screens show, so they do not have to read every question.
//
// This file is plain JavaScript with no app imports, so the batch script can
// use the same rules.
import { SECTION_ORDER } from './mnemonics.js';

export const SECTIONS = SECTION_ORDER;

export const CHAPTERS = [
  'Cardiology',
  'Respiratory',
  'Neurology',
  'Nephrology & urology',
  'Gastroenterology & hepatology',
  'Endocrinology & growth',
  'Haematology & oncology',
  'Infection',
  'Immunology & allergy',
  'Genetics & syndromes',
  'Neonatology',
  'Development, behaviour & safeguarding',
  'Dermatology',
  'Rheumatology & musculoskeletal',
  'Metabolic medicine',
  'Emergency medicine & toxicology',
  'Pain, anaesthesia & palliative care',
  'Clinical pharmacology & therapeutics',
  'Research & statistics',
  'Ethics & law',
  'Ophthalmology',
  'Adolescent health',
  'Nutrition',
  'Other',
];

// Old and imported category names → the chapter they belong to.
const ALIASES = [
  [/^(cardio|heart)/, 'Cardiology'],
  [/^(resp|chest|ent\b|ear|airway)/, 'Respiratory'],
  [/^(neuro|cns|brain)/, 'Neurology'],
  [/^(nephro|renal|kidney|urolog)/, 'Nephrology & urology'],
  [/^(gastro|git|gi\b|hepat|liver|pediatric surgery|paediatric surgery|surgery)/, 'Gastroenterology & hepatology'],
  [/^(endocrin|growth$|diabet)/, 'Endocrinology & growth'],
  [/^(haemat|hemat|oncol|blood)/, 'Haematology & oncology'],
  [/^(infect|vaccin|immunis|immuniz)/, 'Infection'],
  [/^(immun|allerg)/, 'Immunology & allergy'],
  [/^(genet|syndrom)/, 'Genetics & syndromes'],
  [/^(neonat|newborn)/, 'Neonatology'],
  [/^(develop|growth and develop|psy|behav|safeguard|child protection|community)/, 'Development, behaviour & safeguarding'],
  [/^(derma|skin)/, 'Dermatology'],
  [/^(rheum|rhum|musculo|ortho)/, 'Rheumatology & musculoskeletal'],
  [/^(metabol)/, 'Metabolic medicine'],
  [/^(emergenc|toxic|poison|critical|intensive)/, 'Emergency medicine & toxicology'],
  [/^(pain|anaesth|anesth|palliat)/, 'Pain, anaesthesia & palliative care'],
  [/^(pharma|pediatric drugs|paediatric drugs|drugs?$|therapeut)/, 'Clinical pharmacology & therapeutics'],
  [/^(research|stat|m[e]?dical statistics|epidem|evidence)/, 'Research & statistics'],
  [/^(ethic|law|legal)/, 'Ethics & law'],
  [/^(ophth|opth|eye)/, 'Ophthalmology'],
  [/^(adolesc)/, 'Adolescent health'],
  [/^(nutri|malnutri|vitamin|feeding)/, 'Nutrition'],
];

/** A stored category name as one of CHAPTERS, or '' if it does not say. */
export function normalizeChapter(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  if (CHAPTERS.includes(s)) return s;
  const low = s.toLowerCase();
  const exact = CHAPTERS.find((c) => c.toLowerCase() === low);
  if (exact) return exact;
  const hit = ALIASES.find(([re]) => re.test(low));
  return hit ? hit[1] : '';
}

// Words in the stem that point to a chapter, for questions with no usable category.
const CHAPTER_WORDS = {
  Cardiology: /\b(murmur|cardiac|heart|ecg|arrhythmi|tachycardi|bradycardi|fallot|vsd|asd|ductus|pda|coarctation|aortic|pulmonary stenosis|kawasaki|cardiomyopath|myocard|endocard|pericard|transposition|qt interval|syncope)/,
  Respiratory: /\b(asthma|wheez|cough|stridor|bronch|pneumon|lung|spirometr|fev1|cystic fibrosis|croup|tonsil|adenoid|otitis|sleep apnoea|pleural|respiratory)/,
  Neurology: /\b(seizure|epilep|convuls|headache|hydroceph|meningitis|encephal|cerebral|cranial nerve|neuropath|hypoton|ataxia|palsy|migraine|neural tube|spinal|muscular dystrophy|eeg|stroke)/,
  'Nephrology & urology': /\b(renal|kidney|nephr|glomerul|proteinuria|haematuria|urinary|uti\b|bladder|testis|testicular|hypospadias|dialysis|creatinine)/,
  'Gastroenterology & hepatology': /\b(diarrhoea|vomiting|abdominal|bowel|coeliac|crohn|colitis|liver|hepat|jaundice|biliary|pancrea|oesophag|stomach|gastric|intussus|pyloric|constipation|stool)/,
  'Endocrinology & growth': /\b(thyroid|diabet|insulin|puberty|cortisol|adrenal|pituitary|growth hormone|short stature|tall stature|hypoglyc|hyperglyc|parathyroid|calcium|vitamin d|rickets|gonad)/,
  'Haematology & oncology': /\b(anaemia|haemoglobin|platelet|bleeding|clotting|coagul|haemophilia|sickle|thalass|leukaemia|lymphoma|tumour|neuroblastoma|wilms|chemotherapy|transfusion|neutropenia)/,
  Infection: /\b(infection|organism|bacteri|virus|viral|vaccin|immunis|sepsis|antibiotic|tuberculosis|hiv|malaria|measles|varicella|herpes|streptococc|staphylococc|fever)/,
  'Immunology & allergy': /\b(allerg|anaphyla|immunodeficien|immunoglobulin|complement|t cell|b cell|lymphocyte|neutrophil|hypersensitivity|urticaria|food allergy)/,
  'Genetics & syndromes': /\b(syndrome|chromosom|trisomy|genetic|inherit|autosomal|x-linked|mutation|deletion|karyotype|pedigree|dysmorph)/,
  Neonatology: /\b(neonat|newborn|preterm|premature|gestation|weeks' gestation|birth weight|nicu|delivery|resuscitat|surfactant|day-old|days old)/,
  'Development, behaviour & safeguarding': /\b(develop|milestone|autism|adhd|behaviour|abuse|safeguard|non-accidental|neglect|speech|enuresis|sleep problem)/,
  Dermatology: /\b(rash|eczema|psoria|acne|skin|naev|blister|urticaria|alopecia|dermat)/,
  'Rheumatology & musculoskeletal': /\b(arthritis|joint|limp|hip|bone pain|fracture|lupus|vasculitis|jia|scoliosis|perthes|osteo)/,
  'Metabolic medicine': /\b(metabolic|inborn error|ammonia|urea cycle|organic acid|storage disease|lysosomal|phenylketon|galactos|acyl|mitochondrial|glycogen)/,
  'Emergency medicine & toxicology': /\b(poison|overdose|ingest|toxic|burn|drown|trauma|shock|collapse|emergency|head injury|road traffic)/,
  'Pain, anaesthesia & palliative care': /\b(palliat|analges|morphine|opioid|anaesth|sedation|end of life|pain relief)/,
  'Clinical pharmacology & therapeutics': /\b(mechanism of action|drug|side effect|adverse effect|dose|pharmacokinetic|half-life|interaction)/,
  'Research & statistics': /\b(study|trial|sensitivity|specificity|predictive value|confidence interval|odds ratio|relative risk|p value|bias|randomi|statistic|audit)/,
  'Ethics & law': /\b(consent|confidential|ethic|parental responsibility|gillick|fraser|court|capacity|law)\b/,
  Ophthalmology: /\b(eye|visual|vision|pupil|retina|optic|squint|strabismus|cataract|glaucoma|conjunctiv)/,
  'Adolescent health': /\b(adolescen|teenage|anorexia|bulimia|self-harm|contracept|sexually|alcohol)/,
  Nutrition: /\b(breast milk|breastfe|formula|nutrition|malnutrition|vitamin|iron deficiency|feeding|kwashiorkor|marasmus|weaning)/,
};

/** Best guess of a chapter from the question text, or '' if nothing fits. */
export function guessChapter(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  let best = '';
  let bestScore = 0;
  for (const [ch, re] of Object.entries(CHAPTER_WORDS)) {
    const g = new RegExp(re.source, 'g');
    const n = (t.match(g) || []).length;
    if (n > bestScore) {
      best = ch;
      bestScore = n;
    }
  }
  return best;
}

/** The chapter of a question: its stored category if that says, else a guess. */
export function chapterOf(q) {
  return (
    normalizeChapter(q?.category1) ||
    normalizeChapter(q?.category2) ||
    guessChapter(`${q?.question || ''} ${q?.[q?.answer] || ''}`) ||
    'Other'
  );
}

// Basic-science sections. Strong phrases (3 points) name the science outright;
// weak words (1 point) lean towards it. A question that asks for a diagnosis or
// a management step, with nothing stronger, stays Clinical.
const SCIENCE_RULES = {
  Statistics: {
    strong: /\b(sensitivity|specificity|predictive value|confidence interval|odds ratio|relative risk|p[- ]value|null hypothesis|t-test|chi-squared|standard deviation|meta-analysis|number needed to treat|type (i|ii|1|2) error|study design|which (type of )?study|statistical test|likelihood ratio|randomi[sz]ed controlled|cohort study|case[–-]control)/,
    weak: /\b(study|trial|bias|mean|median|prevalence|incidence|sample|audit|screening|probability|risk|power)\b/,
  },
  Pharmacology: {
    strong: /\b(mechanism of action|side[- ]effects?\b|adverse effects?\b|pharmacokinetic|half-life|first-order|zero-order|drug interaction|interacts with|metaboli[sz]ed|inhibitors?\b|agonists?\b|antagonists?\b|toxicity of|how does .{0,30}(work|act)\b|which (drug|antibiotic|antimicrobial|antiseizure|antiepileptic|antihypertensive|inotrope|analgesic|antiemetic|immunosuppressant)|drug and mechanism|should be avoided|main action of)/,
    weak: /\b(drug|drugs|dose|dosing|medication|tablet|infusion|antibiotics?|\w+mab|\w+mycin|\w+cillin|\w+azole|\w+olol|\w+pril|\w+sartan|steroids?|treated with|given|potentiates|resistant)\b/,
  },
  Genetics: {
    strong: /\b(mode of inheritance|inheritance|inherited as|chromosom|karyotype|trisomy|recurrence risk|imprinting|non-disjunction|microdeletion|triplet repeat|anticipation|mosaicism|penetrance|expressivity|pedigree|carrier)/,
    weak: /\b(gene|genetic|mutation|deletion|autosomal|x-linked|dna|allele|microarray|fish)\b/,
  },
  Microbiology: {
    strong: /\b(which organism|causative organism|gram[- ](positive|negative)|culture (shows|grows)|serotype|coccobacill|diplococc|bacilli|virus is|dna virus|rna virus)/,
    weak: /\b(organism|bacteri|virus|viral|fung|parasit|pathogen|toxin|vaccine|resistan)/,
  },
  Immunology: {
    strong: /\b(hypersensitivity|antigen[- ]presenting|mhc|complement|immunoglobulin|t[- ]cells?|b[- ]cells?|natural killer|mast cell|cytokine|interleukin|immunodeficiency|hla)/,
    weak: /\b(immun|antibod|ige|igg|iga|igm|neutrophil|macrophage|lymphocyte|allerg)/,
  },
  Biochemistry: {
    strong: /\b(enzyme|urea cycle|glycolysis|gluconeogenesis|fatty acid oxidation|ketogenesis|metabolic pathway|which vitamin|deficiency of .{0,20}ase\b|amino acid|lysosomal|cofactor)/,
    weak: /\b(metabolism|vitamin|ketone|lactate|ammonia|glucose-6|acyl|glycogen|cholesterol|trace element|zinc|copper|selenium)/,
  },
  Anatomy: {
    strong: /\b(embryolog|develops from|derived from|originates from|pharyngeal (arch|pouch)|which nerve|which artery|which muscle|nerve supply|supplied by|innervat|where is the (lesion|defect|obstruction)|where (does|is) .{0,40}(drain|lie|located)|which (part|layer|structure)|dermatome|germ layer|stage of development)/,
    weak: /\b(nerve|artery|vein|muscle|ligament|foramen|plexus|lobe|anatom|layer|lesion)\b/,
  },
  Physiology: {
    strong: /\b(physiolog|pathophysiolog|normal (value|range|response)|what happens|after birth|cord is clamped|transition|in the fetus|fetal circulation|response to|secreted (by|from)|site of (production|secretion|synthesis)|tidal volume|functional residual|lung volume|spirogram|cardiac output|glomerular filtration|reabsor|dissociation curve|blood gas|acid[–-]base|osmolality|reflex|what causes (the |this |her |his )?[a-z]+\?|explains? (this|the)|why (is|does|do|has|have|did)\b|jugular venous|qt interval)/,
    weak: /\b(hormone|receptor|pressure|flow|oxygen|ventilation|secret|absorb|sodium|potassium|calcium|hypoxia|temperature|sleep)\b/,
  },
};
const CLINICAL_INTENT = /\b(most likely diagnosis|diagnosis\?|next (best )?step|management|most appropriate|what would you|how should|investigation of choice|first[- ]line|refer|admit|advise)\b/;
const SCIENCE_TIE = ['Statistics', 'Genetics', 'Pharmacology', 'Microbiology', 'Immunology', 'Biochemistry', 'Anatomy', 'Physiology'];

/** The basic-science section a question tests (one of SECTIONS). */
export function scienceOf(q) {
  if (q?.science_manual && SECTIONS.includes(q.science)) return q.science;
  const cat = String(q?.category1 || '').trim().toLowerCase();
  if (cat === 'anatomy') return 'Anatomy';
  if (cat === 'physiology') return 'Physiology';
  const stem = ` ${String(q?.question || '').toLowerCase()} `;
  const ans = ` ${String(q?.[q?.answer] || '').toLowerCase()} `;
  const scores = {};
  for (const [sec, { strong, weak }] of Object.entries(SCIENCE_RULES)) {
    const s = (stem.match(new RegExp(strong.source, 'g')) || []).length * 3
      + (stem.match(new RegExp(weak.source, 'g')) || []).length
      + (ans.match(new RegExp(strong.source, 'g')) || []).length;
    if (s) scores[sec] = s;
  }
  const clinical = CLINICAL_INTENT.test(stem) ? 3 : 0.5;
  let best = 'Clinical';
  let bestScore = clinical;
  for (const sec of SCIENCE_TIE) {
    if ((scores[sec] || 0) > bestScore) {
      best = sec;
      bestScore = scores[sec];
    }
  }
  return best;
}

/** The fields a question needs to be found by chapter and science in its bank. */
export function browseFields(q, bank) {
  const chapter = chapterOf(q);
  const science = scienceOf(q);
  const b = String(bank || '').trim() || 'other';
  return { chapter, science, bchap: `${b}|${chapter}`, bsci: `${b}|${science}` };
}

/** A stable, database-safe id for a set (used as the quiz's progress key). */
export function setId({ bank = '', book = '', chapter = '', science = '', filter = '' } = {}) {
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const parts = ['set', slug(bank), slug(book) || 'all', slug(chapter) || 'all', slug(science) || 'all'];
  if (filter) parts.push(slug(filter));
  return parts.join('_');
}

// ---------------------------------------------------------------------------
// Practice sets of one book, by how a question is linked to others and by
// your own answers. A recall question asked in several sittings has a copy in
// each (quizqq/<id>/same, and same_as on the copies); each set uses it once.
//   repeated    asked in more than one sitting (has copies)
//   similar     has similar questions on the same point (quizqq/<id>/similar)
//   linked      repeated or similar
//   unlinked    neither repeated nor similar
//   notsimilar  no similar questions
//   unanswered  you have not answered it (or any copy of it) yet
//   wrong       your answers to it so far are wrong (never right)
// ---------------------------------------------------------------------------
export const PRACTICE = [
  { key: 'repeated', label: 'Repeated questions', hint: 'Asked in more than one sitting' },
  { key: 'similar', label: 'Similar questions', hint: 'Have similar questions on the same point' },
  { key: 'linked', label: 'All linked questions', hint: 'Repeated or similar' },
  { key: 'unlinked', label: 'Unlinked questions', hint: 'Neither repeated nor similar' },
  { key: 'notsimilar', label: 'Not similar', hint: 'No similar question elsewhere' },
  { key: 'unanswered', label: 'Not answered yet', hint: 'Questions you have never answered', mine: true },
  { key: 'wrong', label: 'Answered wrongly', hint: 'Questions you got wrong and not yet right', mine: true },
];
export const practiceLabel = (key) => PRACTICE.find((p) => p.key === key)?.label || '';

const hasKeys = (v) => !!v && typeof v === 'object' && Object.values(v).some(Boolean);
const keysOf = (v) => (v && typeof v === 'object' ? Object.keys(v).filter((k) => v[k]) : []);

/** The id shared by every copy of one question. */
export const groupOf = (q) => String(q?.same_as || q?._key || '');
export const isRepeated = (q) => hasKeys(q?.same);
export const isSimilar = (q) => keysOf(q?.similar).some((k) => !q?.same?.[k]);

/**
 * One question per group (the original where present), keeping order.
 * `list` items need `_key`.
 */
export function uniqueQuestions(list = []) {
  const byGroup = new Map();
  list.forEach((q) => {
    const g = groupOf(q);
    const have = byGroup.get(g);
    if (!have || (have.same_as && !q.same_as)) byGroup.set(g, q);
  });
  const keep = new Set([...byGroup.values()].map((q) => q._key));
  return list.filter((q) => keep.has(q._key));
}

/**
 * Applies a practice filter. `history` is { questionId: 1 | 0 } across all
 * your quizzes; a question counts as answered if any of its copies is.
 */
export function practiceFilter(list = [], filter, history = {}) {
  const outcome = (q) => {
    const ids = [q._key, q.same_as, ...keysOf(q.same)].filter(Boolean);
    const seen = ids.filter((id) => history[id] !== undefined);
    if (!seen.length) return null;
    return seen.some((id) => Number(history[id]) === 1) ? 1 : 0;
  };
  const test = {
    repeated: isRepeated,
    similar: isSimilar,
    linked: (q) => isRepeated(q) || isSimilar(q),
    unlinked: (q) => !isRepeated(q) && !isSimilar(q),
    notsimilar: (q) => !isSimilar(q),
    unanswered: (q) => outcome(q) === null,
    wrong: (q) => outcome(q) === 0,
  }[filter];
  const unique = uniqueQuestions(list);
  return test ? unique.filter(test) : unique;
}

/** A heading for a set, e.g. "Cardiology · Pharmacology". */
export function setTitle({ chapter = '', science = '', bookTitle = '', filter = '' } = {}) {
  const parts = [practiceLabel(filter), chapter, science === 'Clinical' ? 'Clinical (bedside)' : science].filter(Boolean);
  const head = parts.join(' · ') || 'All questions';
  return bookTitle ? `${head} — ${bookTitle}` : head;
}
