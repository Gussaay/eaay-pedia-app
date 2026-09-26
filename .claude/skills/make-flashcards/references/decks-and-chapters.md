# Decks and chapters

Read this when deciding how to carve a source into decks and chapters. The choice is not
cosmetic: it decides what a study session can be.

## How the app stores them

```
flashcategory/<key>                  category   (MRCPCH)
flashbooks/<key>                     book       (Clinical Cases)
flashdecks/<deckId>                  deck       (TAS clinical case)
flashcard_items/<deckId>/<cardId>    the cards
flashprogress/<uid>/<deckId>/<cardId>  per-person boxes and due dates
```

The three catalogue levels are linked by a `source` string, the same way the MCQ catalogue
works, so deleting a category does not orphan-delete the books beneath it.

Note the cards are under `flashcard_items`, not `flashcards`. The `flashcards` node belongs
to the old Sketchware app and holds per-topic score records.

## Deck sizing

A deck is loaded in a single read and studied in memory, which is why the Realtime Database
suits this app. A few hundred cards is comfortable — roughly 60 KB for 300 cards.

Split by the source's major parts rather than building one enormous deck. Two reasons
beyond size: progress is stored per deck, so a smaller deck gives a meaningful "mastered"
number sooner, and the chapter picker inside a 2,000-card deck is a wall of options.

## Chapters

`chapter` is a plain column on the card. `chaptersOf()` groups cards by the **exact
string**, so `Cardiology` and `cardiology` become two separate entries in the picker,
splitting the deck in a way nobody intended. The build script treats a case collision as an
error for this reason.

Cards with no chapter are grouped under `Unsorted`, which is a legitimate choice for a deck
that genuinely has no sections — just make it deliberate rather than accidental.

Sizing:

- **At least ~10 cards** per chapter, or selecting it does not make a session.
- **Not more than about 20 chapters** per deck, or the dropdown needs scrolling to use.
- Name chapters after what the learner is revising ("Respiratory"), not after the source's
  internal numbering ("Section 2.4").

If the source has many small sections, the usual fix is to make `chapter` the system and
put the source's own section title in `tags`. That is what the MRCPCH TAS conversion did:
11 chapters by system, with `Case 1: A girl with unequal pupils` and similar kept as tags.

## Re-checking what exists

The categories, books and decks are created in the admin UI, so there is no fixed list to
match against — unlike MCQ `category1`, which must match a chapter name exactly. Ask the
user which deck the cards are for, or look at **Admin > Flash cards** in the running app.

To read the live catalogue from the repo:

```js
import { loadDecks } from './src/lib/flashcardData.js';
```

The deck's own `system` field is what the gap analysis (`findGaps`) groups by, so it is
worth getting right when the deck is created — but a card upload cannot set it, and the
`system`/`category`/`specialty` columns in a sheet are read and ignored.
