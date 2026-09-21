# google-services.json

This file tells the Android app which Firebase project to register with for
push notifications. Without it, the `com.google.gms.google-services` Gradle
plugin is skipped and **push notifications silently do nothing** — the build
still succeeds, which is what makes this easy to miss.

It is **not a secret**. Google publishes it inside every Android app that uses
Firebase, and it only contains public identifiers. The database rules are what
protect the data.

## The file here was written by hand

The values came from the project's own web config (`src/firebase.js`): project
number `444201218220`, app id `1:444201218220:android:8221b6da25e9c967022f09`,
package `com.easy.pediamcqs`.

That is usually enough, but the API key it carries is the **web** key. If
Android push registration fails — look for `registrationError` in `adb logcat`
— replace this file with the real one:

1. Firebase console → **Project settings** → **Your apps** → the Android app
   for `com.easy.pediamcqs`.
2. **google-services.json** → download.
3. Save it over this file and commit it.

## Also needed for Google sign-in on the phone

Add the release signing certificate's SHA-1 to that same Android app in the
console, or Google sign-in fails on installed builds:

```
38:4D:33:7D:E2:E2:FA:E3:8F:EF:F5:3D:3A:99:63:11:88:1D:D5:2B
```

## Overriding it in CI

If you would rather not commit the real file, put its contents in a GitHub
secret called `GOOGLE_SERVICES_JSON` and the deploy workflow writes it over
this one before building.
