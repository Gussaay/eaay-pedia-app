# Updates, notifications and the download manager

How the app keeps itself current, and the few things only you can set up.

## The three kinds of update

| | What changes | How big | Who decides |
|---|---|---|---|
| **Over the air** | The web layer: screens, MCQ logic, fixes | a few hundred KB | Automatic on every deploy |
| **Full install (APK)** | The native app: plugins, permissions | ~10 MB | The user taps Download and install |
| **Website** | The PWA | nothing to download | The user reloads |

Almost every release is over-the-air. A full install is only needed when
`package.json` gains or loses a Capacitor plugin — **and when that happens you
must bump `MIN_NATIVE_BUILD` in `.github/workflows/deploy.yml`** to the
versionCode of that build.

That number is the one piece of this that is not automatic, and it matters: it
stops an old APK downloading web code that calls a plugin it does not contain,
which would crash the app on launch with no way out but reinstalling.

## What happens on a deploy

1. CI builds the site, zips `dist/` and publishes it to
   `https://easy-pedia.web.app/latest/update-<version>.zip` with a SHA-256
   checksum in `/latest/update.json`.
2. It confirms both files are really live.
3. `scripts/publish-release.mjs` records the build in `update/history` and
   points `update/live` at it — unless you have paused the rollout.
4. `scripts/send-push.mjs --release` notifies every device that is not already
   on that version.

Commit-message switches: `[force-update]` makes it required, `[hold]`
publishes the files without rolling them out, `[no-notify]` skips the push.

## Admin panel

- **Update manager** — pause a rollout, roll back to any earlier build, mark a
  release required, edit the "what's new" text, and see which versions people
  are actually running.
- **User manager** — 1,400+ accounts with search, activity and country
  breakdowns; grant admin access, block an account, or send one person a
  notification.
- **Notification manager** — write an announcement, choose everyone / one
  education level / one person, and send it as a push notification.

Granting admin from the User manager works without a new release: `useAuth`
treats `quizusers/<uid>/admin === "true"` as admin, alongside the addresses
hard-coded in `src/config.js`.

## Why notifications are sent from GitHub Actions

Sending a push needs the Firebase service account. That credential can never
ship inside an app — anyone could pull it out of the APK and notify all your
users. Cloud Functions would be the usual home for it, but they need the Blaze
plan.

So the admin panel writes the request to `push_outbox`, and a scheduled
workflow holding the credential delivers it. Announcements appear in the app
immediately; the push follows within about ten minutes, or straight away if
you run **Send queued notifications** from the Actions tab.

If you move to Blaze later, a Cloud Function can drain the same node and the
app needs no change.

## What you still need to do

### 1. Web push certificate (only for the website)

Firebase console → Project settings → **Cloud Messaging** → Web Push
certificates → **Generate key pair**. Put the key in the repository as the
secret `VITE_FIREBASE_VAPID_KEY`, or in `.env` locally. Without it the Android
app still gets notifications; the website does not.

### 2. Check `google-services.json`

`android/app/google-services.json` was written by hand from the project's own
config. If push registration fails on a phone, download the real file from the
console — see `android/app/GOOGLE-SERVICES-README.md`.

### 3. Tighten the database rules

Your rules currently let **any signed-in user write anywhere**, which now means
any of your users could queue a push to everyone or redirect every app to a
bundle of their choosing. `database.rules.admin.json` has three blocks to merge
into your existing rules; they only touch the new nodes, so the old Android app
is unaffected.

### 4. SHA-1 for Google sign-in

Add `38:4D:33:7D:E2:E2:FA:E3:8F:EF:F5:3D:3A:99:63:11:88:1D:D5:2B` to the
Android app in the Firebase console.

## Installing from inside the app

`src/lib/downloads.js` downloads the APK to the cache directory, shows
progress, and hands it to Android's installer through FileProvider — no trip
to the Downloads folder. Android asks "allow installing from this app" once;
that is the OS, and it cannot be skipped.

The **App & updates** screen (side menu) lists what has been downloaded, with
re-open, retry and delete.
