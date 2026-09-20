# Categories (chapters) in the Easy Pedia MCQs database

`category1` and `category2` link a question to a chapter in the `chapters` node. The
"By system" quizzes select questions whose `category1`/`category2` match the chapter name
**exactly**, so a near-miss like "Cardiology" instead of "cardiology" puts the question in
no system quiz at all. Copy names from this list rather than typing them from memory.

## Current chapter names (as stored, September 2026)

```
CNS                       Child Health              Dermatology
ENT                       Emergencies               Endocrinology
GIT                       Growth and Development    Haematology
Immunology                Neonatology               Pediatric Drugs
Respiratory               Rhumatology               vaccination
cardiology                genetics                  infectious disease
mdical statistics         metabolic disease         nephrology
nutrition                 oncology                  pediatric surgery
urology
```

Note the spellings exactly as they are in the database: lower-case `cardiology`,
`genetics`, `nephrology`, `nutrition`, `oncology`, `urology`, `vaccination`,
`infectious disease`, `metabolic disease`, `pediatric surgery`, and the existing typos
`Rhumatology` (rheumatology) and `mdical statistics` (medical statistics). Match them as
they are, otherwise the questions will not appear under that system. If the typos get
fixed in the database later, the questions' categories must be updated at the same time.

## Re-checking the live list

The list changes when an admin adds chapters, so confirm it when accuracy matters:

- **In the app**: Admin panel → Chapters / systems.
- **In the Firebase console**: Realtime Database → `chapters` node; each child's `chapter`
  field holds the name.
- **In code** (from the app folder, signed-in session not required for a quick look at the
  cached copy): `localStorage` key `rtdb:chapters` in the browser, or a one-shot read of
  the `chapters` node.

## Choosing a category

- Pick the system a learner would revise the topic under, not the organ mentioned in
  passing: a question about neonatal jaundice from biliary atresia is `GIT` if it is about
  the liver disease, `Neonatology` if it is about the newborn presentation.
- Use `category2` for a genuine second home (for example a metabolic disease presenting as
  a neonatal emergency), and leave it empty otherwise — a wrong second category pulls the
  question into a system quiz where it does not belong.
- A chapter only appears in a book's "By system" list when its record has `collection` set
  to `true` and the sub-type flag for that book, which the admin sets in Chapters / systems.
  A question can carry a category whose chapter is not yet in any collection; it will still
  be in its own quiz.
