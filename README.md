# Easy Pedia MCQs — React web app + Capacitor mobile app

A rewrite of the Sketchware/Java Android app (`app/` in this folder, package `com.easy.pediamcqs`)
as a React web app that also ships as a native Android app through Capacitor —
the same stack and conventions as the IMCI app (`C:\Users\Lenovo\imci-app`):
Vite + React 18 + Tailwind 3 + Firebase JS SDK + Capacitor 7 + PWA (vite-plugin-pwa)
+ `@capgo/capacitor-social-login` for native Google sign-in.

It uses the **same Firebase project (`easy-pedia`)** — same Realtime Database,
Auth users and Storage — and writes data in exactly the same format (numbers
stored as strings, same paths and field names), so the old Android app and the new
app can run side by side on the same data.

## Commands

```bash
npm install
npm run dev              # http://localhost:5173
npm test                 # unit tests for the quiz/scoring logic
npm run build            # production web build -> dist/
npm run deploy:web       # build + firebase deploy --only hosting (easy-pedia.web.app)
npm run mobile:sync      # build + copy web assets into android/
npm run mobile:open      # open android/ in Android Studio
npm run mobile:build:apk # release APK (needs signing config, see below)
node scripts/make-icons.mjs   # regenerate logo/PWA icons + assets/ for Capacitor
npx @capacitor/assets generate --android   # regenerate native icons/splash from assets/
```

Android builds need JDK 21 (Android Studio's bundled JBR works:
`JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"`).

## Screen map (Android activity → web route)

| Android activity | Route | Notes |
|---|---|---|
| MainActivity (splash + sign in) | `/login` | Email sign-in, offer to create account, Google (web popup / native SocialLogin), password reset |
| SetprofileimageActivity + CountryCodeActivity | `/setup` | Name, preset/uploaded avatar, level, country |
| MainPageActivity (+ drawer, daily quiz, contact dialog, update dialog) | `/` | |
| McqsMainActivity | `/cat/:source` | Books of a category |
| HomeActivity | `/book/:source` | "By exam" / "By system" tabs for collection (smsb) books |
| QuizdetailActivity | `/quiz/exam/:allquizKey`, `/quiz/chapter/:chapterKey` | Score, trials, leaderboard |
| QuizReviewActivity | `/play/...?mode=review\|exam` | All / first N / from question N, resume, save for later, explanation + comments, 30 s-per-question exam timer, admin quick edit |
| ResultsActivity | `/results` | Share result as image |
| OverAllPerformanceActivity / PerformanceActivity | `/performance` | Donut chart, share, reset |
| ProfileActivity | `/profile` | |
| NotificationsActivity | `/notifications` | |
| ContactPageActivity / AboutMeActivity / PrivacyPolicy* | `/contact`, `/about`, `/privacy` | |
| AdminActivity & Add*/Edit*/PreviewEdit/ShowChapter/EditChapter/ExamChapters | `/admin/...` | Admins = same hard-coded emails as Android (`src/config.js`) |

Not ported (unreachable from any screen in the Android app, or platform-specific):
ExamBook/ShowExamList/DownloadFiles, Chat/ChatList/AllUsers/UserInfo, Fcm/SendNotification,
TestActivity, the boot/reboot services, AdMob ads and FCM push.

## Bulk import of question sets

Admin panel > a quiz > **Import**: upload a whole question set as Excel (.xlsx/.xls)
or CSV, one question per row.

- Column names are flexible ("Option A", "correct answer", "system"...), extra
  columns are ignored; `src/lib/questionImport.js` holds the mapping and is unit-tested.
- The correct answer may be a letter (`a`, `A.`, `option b`), a number (1-5) or the
  full text of the correct option; labels typed inside an option ("a) Croup") are removed.
- A preview lists rows with problems (missing options, unknown answer) and likely
  duplicates (against the quiz and inside the file); only clean rows are imported.
- The import is one atomic multi-path write (`updatePaths`), so a failure saves
  nothing, and the quiz's question counter is updated in the same write.
- "Download template (CSV)" gives a ready-made file with the expected columns.

## Offline use

The Realtime Database JS SDK has no disk cache (only the native Android/iOS SDKs
do), so offline support is built in `src/lib/offline.js` (IndexedDB) and
`src/lib/sync.js`:

- every quiz opened online is saved automatically (newest 40 kept);
- "Save for offline" on a quiz keeps it permanently (never auto-removed);
- quizzes play fully offline: questions, options, explanations, images;
- a result finished offline is queued and sent automatically when the
  connection returns (even after the app is closed), recalculated against the
  server values at that moment so it never overwrites newer progress;
- Profile > Offline shows what is stored, pending results and "Clear offline data".

## AI Study helper (Groq + Gemini, admins only)

`/ai` (Home > **AI Study**, also in the side menu) has a tutor chat, "Quiz me"
(generated MCQs), generated flashcards and a mnemonic maker. Every quiz
explanation also gets an **Explain with AI** button with follow-up questions.

A Gemini/Claude *chat subscription* cannot be connected to another app, so this
uses **API keys**. Answers come from OpenAI's open GPT-OSS models on Groq's free tier
(1,000 requests and 200K tokens a day per model), with Gemini from Google AI Studio as
the backup. The keys are Firebase secrets read only by the `aiStudy` Cloud Function
(`functions/ai.js`). They never ship in the APK, and the function refuses anyone
who is not an admin (same emails as `src/config.js`, or the User manager's admin flag).

One-time setup:

```bash
# 1. create a key at https://console.groq.com/keys
firebase functions:secrets:set GROQ_API_KEY     # paste the key
# 2. backup: create a key at https://aistudio.google.com/apikey
firebase functions:secrets:set GEMINI_API_KEY   # paste the key
firebase deploy --only functions
```

Both secrets must exist before deploying (the deploy stops on a missing one),
including the automatic functions deploy on a push to `main`.

The order is `openai/gpt-oss-120b`, then `openai/gpt-oss-20b` when its daily allowance
runs out, then `gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-2.5-flash` and
`gemini-2.5-flash-lite`. To pin one model, put `GROQ_MODEL=...` or `GEMINI_MODEL=...` in
`functions/.env` and redeploy. Under every reply a **Compare with Gemini / Groq** button
asks the other provider the same thing and shows both answers. Generated sets are not
saved anywhere. The **CSV** button downloads them in the Import / "Upload a set" format
if you want to keep them.

### The Agent tab (a tutor with tools)

The **Agent** tab is a tutor that can act, not only answer (`functions/agent.js`). For each
message the model may, a few steps at most, search the whole question bank, search your
indexed textbooks (cited as [1], [2]), read your own quiz history to find weak topics,
save a practice quiz from questions it found (`aiquiz/<uid>/<id>`, opened with an
**Open quiz** button like any quiz), or ask you a multiple-choice question back. The steps
it took are listed above its reply. Each step is one AI request, so an agent message can
use 2 to 5 of the day's allowance.

### Answering from your own textbooks

Turn on **From my textbooks** under the tutor chat (it shows once a book is indexed) and
explanations and tutor answers are built from passages of your PDFs, cited as [1], [2]
with book and page listed under the reply. It is free: Gemini's embedding model turns
each passage into a vector once, the vectors and passages live in the Realtime Database
under `books/`, and each question searches them in the `aiStudy` function
(`functions/books.js`) before Groq or Gemini answers.

Indexing runs on your PC (PDFs with real text; scanned books need OCR first):

```bash
cd tools/books
npm install
set GEMINI_API_KEY=...                     # PowerShell: $env:GEMINI_API_KEY="..."
node index-books.mjs D:\Books              # dry run: pages, passages, time per book
node index-books.mjs D:\Books --commit     # embed and upload (uses your firebase login)
node index-books.mjs --list
node index-books.mjs --remove <id>
```

The free embedding tier allows about 30,000 tokens a minute and 1,000 requests a day,
so a 1,500-page book takes about an hour and several books may need two days. The script
paces itself and an interrupted or quota-stopped run carries on where it left off.

## ⚠️ Things to do in the Firebase console

1. **Deploy the database rules.** `database.rules.json` is the whole ruleset — the
   permissive default the app has always used, plus the `.indexOn` entries, plus
   tighter rules on the nodes that can hurt someone (`update`, `push_outbox`,
   `push_tokens`, the flashcard nodes and `interest`). Deploy it with:

   ```bash
   firebase deploy --only database --project easy-pedia
   ```

   Two things this fixes. Without `.indexOn`, filtered reads fall back to
   downloading the whole `quizqq` node — the entire question bank — and filtering
   locally, which is slow on mobile data. And without the tighter rules, any
   signed-in user can queue a push notification to everyone or point every
   installed app at an update of their choosing.

   CI deploys Hosting only, so rules are never deployed behind your back. A rules
   deploy replaces everything at once; the console keeps a history if you need to
   roll back.
2. **Firebase Storage returns HTTP 402 (billing required)** for the default
   `easy-pedia.appspot.com` bucket, so existing images (category covers, quiz covers,
   explanation images, avatars) do not load — in the old Android app either — and
   uploads fail. Google requires the Blaze plan for `*.appspot.com` buckets now.
   Upgrading the project to Blaze restores them. The app shows placeholders meanwhile.
3. **Register a Web app** (Project settings → Your apps → Web) and set
   `VITE_FIREBASE_APP_ID` in `.env` (see `.env.example`). Auth/DB/Storage already work
   with the Android app id; the web id is needed for Analytics/Messaging.
4. **Authorized domains** already include `localhost` and `easy-pedia.web.app`.
   Add any other domain you host the web app on.
5. **Google sign-in on Android:** the native app uses the web client id from the old
   app. Make sure the SHA-1 of the keystore you sign the new APK with is registered on
   the Android app `com.easy.pediamcqs` in Firebase.

## Publishing the Android app

`applicationId` is `com.easy.pediamcqs` with `versionCode 10 / versionName 6.0`, so it
can be published as an **update** to the existing Play Store listing (old app is
versionCode 9) — this requires signing with the **same keystore** as the old app.
Set `update/app/ver` to `6` in the database to prompt old Android users to update.
