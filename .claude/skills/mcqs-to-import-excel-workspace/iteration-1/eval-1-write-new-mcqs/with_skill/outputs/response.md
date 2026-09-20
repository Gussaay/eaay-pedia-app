15 new neonatal jaundice MCQs are ready, in both formats, in your Downloads folder:

- `C:\Users\Lenovo\Downloads\neonatal-jaundice-mcqs.xlsx`
- `C:\Users\Lenovo\Downloads\neonatal-jaundice-mcqs.csv`

**What's in them**

Single best answer, 5 options each, every one written as a clinical vignette that can be answered before you look at the options, with a 3–4 sentence explanation that says why the answer is right and then names the distractor most people fall for.

Topics, spread across the usual exam territory rather than clustered:

| | |
|---|---|
| Haemolytic | ABO incompatibility, Rh disease and anti-D prophylaxis, G6PD deficiency, hereditary spherocytosis |
| Feeding-related | suboptimal-intake (breastfeeding) jaundice vs breast-milk jaundice |
| Conjugated | biliary atresia, galactosaemia |
| Prolonged | congenital hypothyroidism, UTI |
| Conjugation defects | Crigler-Najjar type I vs II |
| Management | acute bilirubin encephalopathy and exchange transfusion, phototherapy mechanism, hour-specific nomogram thresholds |
| Other | cephalhaematoma and bilirubin load |

**Checks done**

- Answer spread: a:5, b:2, c:2, d:3, e:3 — options were shuffled, so there's no "the answer is usually A" pattern for users to learn.
- Categories: all 15 are `Neonatology`, with a second category on 10 of them (`Haematology` ×4, `metabolic disease` ×2, `GIT`, `Endocrinology`, `infectious disease`, `Emergencies`, `nutrition`). These are spelled exactly as your chapters are stored, lower-case ones included, so they'll show up correctly in the "By system" quizzes.
- Validated with the app's own import parser (`src/lib/questionImport.js`), not just a generic check: 15 rows read, 15 importable, 0 errors, 0 duplicates, no unrecognised columns. I also confirmed the answer letter still points at the intended option text after shuffling.

**To import**

Admin panel → open the quiz → **Import** → choose the file → check the preview shows 15 questions and 0 problems → **Import 15 questions**. Either file works; the .xlsx is easier to eyeball first.

**Worth a quick review before you publish**

- Thresholds are described in principle (hour-specific nomogram, gestation, risk factors) rather than as fixed numbers, but the question on the encephalopathic baby quotes a bilirubin of 32 mg/dL — check that reads right against the chart your users are taught from.
- The galactosaemia question says the milk is switched to soya formula before the confirmatory enzyme assay returns; confirm that matches your local practice.
- Units are given as mg/dL with micromol/L alongside in one question. Say the word if you'd rather I convert the whole set to one unit.
