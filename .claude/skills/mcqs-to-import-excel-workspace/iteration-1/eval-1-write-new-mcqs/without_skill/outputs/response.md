Done — 15 new single-best-answer MCQs on neonatal jaundice, formatted for the app's bulk importer.

**Files (saved to your Downloads folder):**
- `neonatal-jaundice-mcqs-15.xlsx` — upload this one via Admin → the quiz → Import questions
- `neonatal-jaundice-mcqs-15.csv` — same content, UTF-8 with BOM, in case you prefer CSV

**Format:** columns are `question, a, b, c, d, e, answer, explanation, category1, category2` — exactly the headers `src/lib/questionImport.js` expects. Every row has 5 filled options, a lowercase answer letter, and `category1 = Neonatology`, `category2 = Neonatal jaundice`.

**Validated:** I ran the files back through the app's own `parseRows()`/`importableItems()` (including reading the .xlsx exactly the way `ImportQuestionsModal` does). Result: 15 rows parsed, 15 importable, 0 errors, 0 unrecognised headers, 0 internal duplicates. The importer will still flag anything that duplicates a question already in the target quiz when you preview the import.

**Topics covered** (one question each, so there's no overlap):
1. Physiological vs pathological jaundice — the <24 hour red flag
2. ABO haemolytic disease (O mother, A baby, positive DAT)
3. G6PD deficiency with an oxidant trigger
4. Breast milk jaundice — management in a thriving infant
5. Biliary atresia — conjugated jaundice, pale stools
6. Crigler-Najjar type I vs type II (the phenobarbital response)
7. Congenital hypothyroidism as a cause of prolonged jaundice
8. Acute bilirubin encephalopathy — emergency management
9. Kernicterus — the classic long-term tetrad
10. Mechanism of phototherapy (lumirubin)
11. Bronze baby syndrome — phototherapy in cholestasis
12. Rh disease and anti-D prophylaxis
13. Cephalhaematoma — increased bilirubin load
14. Prolonged jaundice screen — why split bilirubin comes first
15. Classical galactosaemia (E. coli sepsis, cataracts, reducing substances)

Each explanation gives the reasoning for the correct answer *and* says why the main distractors are wrong, so they work as teaching points and not just answer keys. Answer letters are spread across a–e rather than clustered.

One thing worth a look before importing: the explanations quote bilirubin in mg/dL with micromol/L in brackets. If the app's existing bank uses only one unit, tell me which and I'll regenerate to match.
