Your 6 recall questions are ready to import. Both files are in your Downloads folder:

- `easy-pedia-recall-questions-part-1.xlsx` (recommended)
- `easy-pedia-recall-questions-part-1.csv` (same content, if you prefer CSV)

They use the exact column names the Easy Pedia importer expects — question, a–e, answer, explanation, category1, category2, explanation_image_url — and I ran both files through the app's own import parser to check: **6 of 6 questions import with no errors, no duplicates and no unrecognised columns.**

**One thing to check before you import — question 4 (UTI investigation).** You'd typed "Ans B" with a note that you thought it was wrong. You were right: B was renal biopsy, so I've set the answer to **A, urine dipstick and culture**. If your source exam really did key it as B, change that one cell before importing. I left its explanation blank rather than invent one.

What else I tidied up, all cosmetic:

- Stripped the "A)" / "a." / "1-" labels — the importer wants the bare option text and adds the lettering itself.
- Normalised the answer lines ("Ans: A", "answer = a", "Correct: A") into a single answer column.
- Moved each trailing sentence into the explanation column; questions 1, 2, 3, 5 and 6 have one.
- Light spelling and formatting fixes to the stems (capitalisation, "X-ray", "2-year-old", spelling out FSGS, MCUG and NEC on first use).
- Added a category1 for each: Respiratory, Nephrology, Neonatology, Nephrology, Haematology, Immunisation. Category2 is empty — fill it in if you use a second level of tagging.

Questions 2, 3, 4 and 6 only had four options, so column E is blank for those; that's fine, the importer accepts it.

Worth noting: the correct answer is A for all six questions, which is how they were typed up. That's fine for the import, but students will spot the pattern — you may want to reorder some options in the app afterwards.

To import: open the quiz in the admin screen, choose Import questions, pick the .xlsx, and confirm the preview.
