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

```
flashdecks/<deckId>                    title, system, topic, cover, count
flashcard_items/<deckId>/<cardId>      front, back, hint, note, images, tags
flashprogress/<uid>/<deckId>/<cardId>  box, due date, seen/right/wrong
flashstats/<uid>                       totals, streak, per-system tallies
```

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
