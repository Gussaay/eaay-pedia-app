Converted — all 5 questions came through clean. The files are in your Downloads folder:

- **questions-import.xlsx** (use this one with the Import button)
- **questions-import.csv** (same data, UTF-8 with BOM, in case you'd rather open it in Excel first)

**How the columns were mapped:**

| Their column | Your format |
|---|---|
| Stem | question |
| Choice 1–4 | a, b, c, d |
| Correct Option | answer |
| Rationale | explanation |
| Topic | category1 |

The `Correct Option` column held the full answer *text* rather than a letter, so I matched each one back to its choice and wrote the letter your importer expects. Empty `e`, `category2` and `explanation_image_url` columns are included so the sheet matches your template exactly.

I validated the result by running it through your app's own `parseRows` logic (`src/lib/questionImport.js`): 5 rows in, 5 rows importable, no errors, no unrecognised headers, no duplicates.

**One thing worth a look:** the correct answer is Choice 1 in every single row, so all five come out as **a**. That's faithful to the export, but it's the kind of pattern that shows up when a tool drops the shuffle on the way out — you may want to spot-check a couple against the original bank before importing, and consider reordering the options so the answer isn't always first.
