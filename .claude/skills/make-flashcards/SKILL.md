---
name: make-flashcards
description: Turn any source material into a flashcard file that bulk-uploads into the Easy Pedia MCQs app (Admin > Flash cards > deck > Upload a set). Use this whenever someone wants flashcards — from a PDF, book chapter, Word file, lecture notes, a past-paper summary, an existing Anki or Quizlet export, or nothing at all ("write me flashcards on nephrotic syndrome"). Also use it when they say "make these into cards", "ready to upload", "bulk upload flashcards", "revision cards", or "memoriser". Covers pulling facts out of messy sources, splitting them into cards that actually work for spaced repetition, tagging chapters so the study picker behaves, and validating the file with the app's own parser before it is uploaded.
---

# Source material to uploadable flashcards

The app studies a deck with a Leitner box scheduler: every card is graded again / good /
easy, and that grade moves the whole card up or down a box. That one detail drives almost
every decision below — a card is the unit of grading, so a card has to be one thing you
either know or do not.

The goal is a file the admin uploads once, not a file they have to fix row by row.

## Where the cards land

Cards live at the bottom of a four-level hierarchy that the admin builds in the UI first:

```
category   (e.g. MRCPCH)            Admin > Flash cards
  book     (e.g. Clinical Cases)
    deck   (e.g. TAS clinical case)   <- the thing a person studies, loaded in one read
      card     <- your rows go here, one per row
        chapter  <- a column on the card, NOT a level of the hierarchy
```

**`chapter` is the most misunderstood field.** It is a plain text column on each card, and
it is what the deck's "study these chapters" dropdown lists. It is not the MCQ side's
`category1`, it does not have to match anything in the database, and nothing outside the
deck sees it. See `references/decks-and-chapters.md` for how to size decks and chapters.

## The output format

| column | meaning |
|---|---|
| `front` | the prompt — what the learner sees before flipping |
| `back` | the answer, and only the answer |
| `hint` | an optional nudge shown on the front for a hard card |
| `note` | optional extra context, shown after the flip |
| `chapter` | the card's section within the deck; drives the chapter picker |
| `tags` | optional comma-separated keywords |
| `image_url` | optional public image URL for the front |

The importer is deliberately forgiving about header names — `question`/`term`/`prompt` all
mean `front`, `section`/`topic`/`subcategory` all mean `chapter` — so these headers are a
safe default, not a strict requirement. What it rejects is a row with an empty front or an
empty back.

Row order is kept as the card order, so leave the cards in teaching order rather than
sorting them.

## Workflow

### 1. Get the material out of the source

- **Text, Word, Markdown, CSV**: read directly.
- **Digital PDF**: extract text (`pypdf`, or `pymupdf`'s `get_text()`).
- **Scanned PDF or images**: no text layer, so render and read the pages visually:
  ```python
  import pymupdf
  doc = pymupdf.open(path)
  doc[i].get_pixmap(dpi=120).save(f"pages/p{i+1:03d}.png")
  ```
  Check page one first — if `page.get_text()` returns nothing, it is scanned.

Work in batches. Accuracy falls off badly near the end of a long extraction, and a card
bank is only as good as its worst tenth.

### 2. Write the cards as JSON

JSON, not CSV: one unescaped comma in a hand-written CSV shifts every later column and the
upload silently stores rubbish. Short keys keep it quick to write.

```json
[
  {"f": "Most common cause of bronchiolitis in infants",
   "b": "Respiratory syncytial virus (RSV)",
   "h": "Think winter epidemics in under-2s",
   "n": "About 70% of cases; peaks at 2-6 months.",
   "ch": "Respiratory",
   "t": "bronchiolitis, RSV"}
]
```

`f`/`b`/`h`/`n`/`ch`/`t`/`img` or the full names both work. Batches of about 40 cards keep
quality up; the script merges several files in the order given.

### 3. Build the file

```bash
node .claude/skills/make-flashcards/scripts/build_flashcards.mjs \
  --in batch1.json batch2.json \
  --out "C:/Users/Lenovo/Downloads/deck-name" --split
```

`--split` also writes one CSV per chapter, which is what you want when the deck is big
enough that the admin may prefer to upload it in parts. `--quiet` suppresses the report.

The script validates through `src/lib/flashcardImport.js` — the app's real parser — when it
can find it, so the report matches what the upload preview will say. It exits non-zero on
anything that would fail, so a broken file never reaches the user.

### 4. Read the report before handing over

It prints the chapter tally and a list of non-blocking warnings. Both are worth a look:

- **A lopsided chapter tally** usually means the source's own structure was followed too
  literally — a 3-card chapter is not a study session.
- **"the back is N characters"** flags cards that are secretly several cards.
- **"reads as a yes/no question"** flags fronts that can be guessed half the time.

Fix what is worth fixing and rebuild. These are judgement calls, not rules.

## Writing cards that actually work

This is the part that decides whether the deck is useful, and it is where a converted
document usually goes wrong: a good paragraph is rarely a good card.

**One idea per card.** A card listing six features of Kawasaki disease is graded as one
thing, so missing the sixth sends all six back to box one, and the learner spends their
next session re-reading the five they knew. Split it into six cards, or ask for one feature
at a time.

**The front has to stand on its own.** Cards are shuffled and come back months later.
"What is the dose?" means nothing in a queue. Put the drug and the situation in the front.

**The back holds the answer and nothing else.** Everything explanatory goes in `note`,
which appears after the flip — that field exists precisely so the back can stay short. A
back the learner has to read twice to score is a back that is doing two jobs.

**Recall runs one way.** If both directions matter — drug to mechanism and mechanism to
drug — write two cards. Do not expect the learner to flip it mentally.

**Turn yes/no into what/which/why.** "Is goat's milk an option in cow's milk protein
allergy?" is a coin flip; "Why is goat's milk not an option in cow's milk protein allergy?"
is a card. Either/or questions ("raises or lowers?") are fine — the learner still chooses.

**Cloze deletion suits sequences and lists**: put `___` in the front where the missing
piece goes, one blank per card.

**`hint` is a nudge, not a partial answer.** Use it when a front is fair but hard, and
leave it empty otherwise — a hint on an easy card just gives the answer away.

## When the source is someone else's published material

Card banks are usually built from textbooks. Facts are free to reuse, but a book's
vignettes and its wording are the author's work, and putting them in an app that ships to
users republishes the book.

So if the source is published and copyrighted, use it as a syllabus — take the topics and
write the cards in your own words — rather than transcribing it. Say so in a sentence and
get on with it. If the material is the user's own notes, their own past papers or their own
bank, convert it directly.

## Delivering

Hand over the files, say where they are, and state:

- how many cards, across how many chapters, with the tally;
- anything to check before it goes live — drug doses, local guidelines, anything uncertain;
- the upload steps: **Admin > Flash cards > category > book > deck > Upload a set**, choose
  the file, check the preview, confirm. The deck must exist first; the upload adds cards to
  a deck, it cannot create one.

Suggest a 2–3 row file first if they have not used the upload before. The preview shows
duplicates against cards already in the deck, so re-uploading a corrected file is safe.
