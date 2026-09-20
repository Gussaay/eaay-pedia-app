---
name: mcqs-to-import-excel
description: Turn ready-made MCQs into an Excel/CSV file that imports into the Easy Pedia MCQs app (Admin > quiz > Import). Use this whenever someone has questions in any form — a Word or PDF file, a scanned book, a text file, a chat message, notes, an existing question bank — and wants them "ready for upload", "in the import format", "as Excel", "bulk uploaded", or added to a quiz in bulk. Also use it when asked to write new MCQs for the app, so the output lands in the right format first time. Covers extracting questions from messy sources, fixing answer keys, tagging categories that match the app's chapters, and validating the file before it is imported.
---

# MCQs to import-ready Excel

The Easy Pedia MCQs app imports a question set from a spreadsheet: one question per row,
with the correct answer given as a letter. This skill takes questions from wherever they
live and produces a file that imports cleanly the first time.

The goal is not just "a spreadsheet" — it is a file the admin can import without having to
fix rows afterwards, because a failed import wastes their time and a wrong answer key
teaches thousands of users the wrong fact.

## The output format

| column | meaning |
|---|---|
| `question` | the stem, including any clinical vignette |
| `a` `b` `c` `d` `e` | options; `c`, `d`, `e` may be empty, and `e` is unused for 4-option sets |
| `answer` | the letter of the correct option (`a`–`e`) |
| `explanation` | why the right answer is right, and why the tempting wrong ones are wrong |
| `category1` | the system/chapter, matched to the app's existing chapters |
| `category2` | optional second chapter |
| `explanation_image_url` | optional public image URL |

The importer accepts flexible column names ("Option A", "correct answer", "system"), so
these exact headers are a safe default rather than a strict requirement. What it will not
accept is a missing answer, an answer that matches no option, or an answer pointing at an
empty option — those rows are rejected in the preview.

## Workflow

### 1. Get the questions out of the source

- **Text, Word, Markdown, CSV**: read directly.
- **Digital PDF**: extract text (`pypdf`, or `pymupdf`'s `get_text()`).
- **Scanned PDF or images**: there is no text layer, so render pages and read them visually:
  ```python
  import pymupdf
  doc = pymupdf.open(path)
  doc[i].get_pixmap(dpi=120).save(f"pages/p{i+1:03d}.png")
  ```
  Then read the page images. Check the first page before rendering all of them — if
  `page.get_text()` returns nothing, it is scanned.

Work through the source in batches rather than trying to hold hundreds of questions in one
pass; accuracy drops badly near the end of a long extraction.

### 2. Author the questions as JSON

Write a JSON array, which is far easier to get right than CSV quoting, and is what the
bundled script expects. Two shapes are accepted:

```json
[
  {"q": "stem…", "a": "…", "b": "…", "c": "…", "d": "…", "e": "", "ans": "a",
   "exp": "…", "cat": "Respiratory"}
]
```
or the long form with `question`/`answer`/`explanation`/`category1`. Batches of about 30
keep quality high; the script merges several files.

### 3. Build the file

```bash
node .claude/skills/mcqs-to-import-excel/scripts/build_import_file.mjs \
  --in batch1.json batch2.json --out "C:/Users/Lenovo/Downloads/quiz-name" --title "Quiz name"
```

The script validates every row, shuffles the options, writes `.xlsx` and `.csv`, and prints
a report. It exits non-zero if anything is wrong, so a bad file never reaches the user.

Useful flags: `--no-shuffle` (keep option order, e.g. for "all of the above" style or
ordered numeric options), `--seed N` (reproducible shuffle), `--csv-only` (skip Excel when
the `xlsx` package is unavailable).

### 4. Check the report before handing over

The script prints the answer spread and category tally. Read them — they catch the two
mistakes that are easy to miss:

- **Answer-position bias.** Questions written by hand or by a model tend to put the correct
  option first, so the file ends up with most answers as "a" and users learn to guess A.
  The script shuffles to prevent this; the spread should look roughly even.
- **Categories that do not exist** in the app, which silently break the "By system" view.

## Categories

`category1` should match a chapter that already exists in the app's database, because the
"By system" quizzes match on the exact name — including its current spelling, typos and
capitalisation. See `references/categories.md` for the current list and how to re-check it.

## Writing the questions well

When writing new questions (rather than converting existing ones), what makes a question
bank worth using:

- **A stem that can be answered without the options** — a short clinical vignette with the
  discriminating detail, not a bare "Which is true about X?".
- **Distractors that are plausible**, ideally the classic confusions, so the question tests
  understanding rather than recognition of an absurd option.
- **An explanation that teaches**: one line on why the answer is right, then the key
  contrast with the distractor most people pick. Two to four sentences is the sweet spot.
- **One defensible answer.** If two options could be argued, tighten the stem.

Prefer 5 options for exam-style banks and 4 where the source uses 4; leave `e` empty rather
than padding with filler.

## When the source is someone else's published material

Question banks are often built from textbooks. Facts are free to reuse, but a book's
vignettes and explanations are the author's work, and copying them into an app that is
published to users republishes that book.

So: if the source is a published book or other copyrighted material, use it as a syllabus —
take the topics and write original stems and explanations — rather than transcribing its
cases. Say plainly that this is what you are doing and why, in a sentence, then get on with
producing the questions. If the material is the user's own (their notes, their past papers,
their existing bank), convert it directly.

## Delivering

Hand over both files, mention where they are, and state:

- how many questions, and how many topics or chapters they cover;
- the answer spread and the category tally;
- anything the user must check — local guidelines, drug doses, anything you were unsure of;
- the import steps: Admin panel → the quiz → **Import** → choose file → check preview →
  **Import N questions**. Suggest trying a 2–3 row file first if they have never used it.

If the app's source is in the working directory, validating with its own parser is a
stronger check than the script alone, because it is the exact code that will run on import:

```js
import { parseRows, importableItems } from './src/lib/questionImport.js';
const res = parseRows(rows); // expect 0 errors, 0 duplicates
```
