Converted — all 5 questions, saved to your Downloads folder:

- `C:\Users\Lenovo\Downloads\exported-bank-import.xlsx`
- `C:\Users\Lenovo\Downloads\exported-bank-import.csv`

(Either one imports; the CSV is there in case Excel is awkward.)

**What I changed from the export**

| Their column | Our column |
|---|---|
| Stem | question |
| Choice 1–4 | a, b, c, d (`e` left empty — 4-option set) |
| Correct Option | answer (was the full option *text*, now a letter) |
| Rationale | explanation |
| Topic | category1 |

Two things worth knowing:

- **Categories were renamed to match your chapters exactly.** "Pediatric surgery" → `pediatric surgery`, "Infectious Disease" → `infectious disease`, "Oncology" → `oncology`. The By-system quizzes match on the exact name, so the original capitalisation would have left those three out of their system quiz. `Respiratory` and `GIT` were already correct.
- **Options were reshuffled.** In the export the correct answer was Choice 1 in all 5 questions, so users would have spotted the pattern immediately. The spread is now a:2, b:1, c:1, d:1.

One per chapter: Respiratory, pediatric surgery, infectious disease, oncology, GIT.

I ran the file through your app's own import parser (`src/lib/questionImport.js`) — 5 rows readable, 0 errors, 0 duplicates, no unrecognised columns — so the preview should come up clean.

**To import:** Admin panel → the quiz → **Import** → choose the file → check the preview → **Import 5 questions**.

One thing to check yourself: the explanations are the other tool's original wording, not mine, so give them a quick read — particularly the fluid-bolus one (10–20 mL/kg), which should match whichever local resuscitation guideline you teach from.
