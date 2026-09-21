# Flashcards

## Realtime Database, not Firestore

You asked which is the cost-effective and professional choice. It is the
Realtime Database you already have, and the reason is how the two bill.

**Firestore charges per document read. The Realtime Database charges for bytes
transferred.** A 300-card deck is 300 reads in Firestore, or one ~60 KB
download here.

On the free tier that is the difference between working and not:

| | Firestore free | Realtime DB free |
|---|---|---|
| Limit that bites | 50,000 reads/day | 10 GB/month transfer |
| 300 people studying one 300-card deck a day | 90,000 reads — **over the limit before lunch** | ~18 MB/day, ~0.5 GB/month — **5% of the allowance** |

Three more reasons:

1. **The work is shaped for it.** A session loads one deck, works through it in
   memory, and saves once at the end. That is one read and one write per
   session, not one per card.
2. **One database.** Everything else — users, quizzes, scores — is already
   here. Two databases would mean two offline stories, two sets of security
   rules and two ways of thinking about the same app.
3. **Progress writes are cheap.** A whole session's answers, the totals and the
   streak go in a single atomic update, so a dropped connection cannot leave
   your counters disagreeing with your cards.

**When Firestore would have won:** queries across every card at once, like "all
cards in any deck tagged X, due today, sorted by difficulty". Flashcards do not
need that, because the deck is the unit people study and the unit we load. If
that ever changes, the progress data is small and could move.

## Where the data lives

Flashcards follow the same four levels as the question banks — Category →
Book → Deck → Cards — so there is one way round this app rather than two:

```
flashcategory/<key>                    title, source, cover, publish
flashbooks/<key>                       title, source, main_category, publish
flashdecks/<deckId>                    title, source, system, topic, count
flashcard_items/<deckId>/<cardId>      front, back, hint, note, images, tags
flashprogress/<uid>/<deckId>/<cardId>  box, due date, seen/right/wrong
flashstats/<uid>                       totals, streak, per-system tallies
```

It is a **separate tree** from `main_category`/`mcqs`/`allquiz`, so flashcards
can be organised to suit themselves without disturbing the question banks.

Levels are linked by a **`source` string**, exactly as the MCQ side does. That
is why deleting a category does not delete the books under it: the link is a
name, not a parent id, so a cascade would have to guess. The dialogs say what
is left behind, and renaming a source has the same effect. A deck *does* own
its cards, so deleting a deck does delete them.

A deck also carries a **`system`** (Cardiology, Neurology…). That is a
different axis from the hierarchy — it is what the progress and gaps screen
groups by, the same way MCQ questions carry `category1` alongside their book —
and the deck form offers the systems already in use so one system does not end
up split between two spellings.

**Note the card node is `flashcard_items`, not `flashcards`.** `flashcards`
already exists and belongs to the old Android app, which keeps per-topic scores
there. Putting decks in it would mix two unrelated things and — worse — put
live score data within reach of the admin screen's "delete all" button.

These records store real numbers and booleans, unlike the older shared nodes.
The strings-for-numbers convention elsewhere only exists to keep the Sketchware
app working, and nothing else reads these.

## How the scheduling works

A Leitner box system: five boxes, and a card comes back after 1, 2, 4, 8 or 16
days depending on which box it is in.

- **Again** → box 1, and the card returns before the session ends
- **Good** → up one box
- **Easy** → up two boxes

It is chosen over an Anki-style ease factor because a learner can see what it
is doing. "Box 4 of 5, back in a week" is something you can reason about; a
hidden multiplier is not. Sessions stop after 20 cards so they always end.

The logic is in `src/lib/flashcards.js` with 14 tests — including that a failed
card comes back the same day, that "easy" cannot overshoot the last box, and
that grading never mutates the record it was given.

## Chapters, and choosing what to study

Each card carries a **chapter** — its sub-division inside the deck. Before a
session starts you choose three things, and the Start button says how many
cards that actually comes to *before* you commit:

- **What to study** — due, new, weak, or everything
- **Which chapters** — any combination, or all of them
- **How many cards** — 10, 20, 50, or no limit

Choosing "50" from a chapter holding 12 should not be a surprise halfway
through, and "nothing is due" is worth knowing before tapping Start rather
than after.

The choices travel in the URL, so a session can be linked to directly. Chapter
names are joined with `|` rather than a comma, because chapter names contain
commas — "Infection, immunity and allergy" is a real one.

On import, a **chapter** column splits the deck up; `section`, `topic`,
`sub-category`, `part` and `sub-chapter` all mean the same thing and land in
the same field, so two spellings cannot create two parallel sets of chapters.

## Gaps

The progress screen ranks systems weakest-first and **holds back any system
with fewer than five answers**. One wrong answer out of one is not a knowledge
gap, and showing it as 0% would send people off to revise something they have
barely met. Where a system is genuinely weak, it names the specific deck to
open rather than saying "your neurology is weak".

## Bulk upload

`src/lib/flashcardImport.js` takes .xlsx/.xls/.csv and is deliberately
forgiving about column names — `front`/`question`/`term`/`side 1` all mean the
same thing, as do `back`/`answer`/`definition`. People build these in Anki,
Quizlet and Word tables, and rejecting a 300-card file over a header would be
the most annoying possible behaviour.

Before anything is written you see how many will be added, how many are
repeats, and which rows cannot be used and why. The import is one atomic write.

Tested with a real file: 4 added, 1 duplicate caught, 1 half-empty row
rejected, from a sheet using "Question/Answer/Notes" as headers.

## The other sections

`src/lib/sections.js` holds the five tiles on the main page. MCQs and Flash
Cards are live; OSCE, On Call and Courses show an announcement page with a
"tell me when it is ready" button.

Those registrations land in `interest/<section>/<uid>`, and the counts are what
should decide which one gets built next — a better signal than guessing. A
section goes live by setting `live: true` and adding its route.
