// Firebase setup: same "easy-pedia" project (Realtime Database + Auth + Storage)
// that the Android app uses, so both apps share users, quizzes and scores.
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { Capacitor } from '@capacitor/core';

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyAnt2Yl_5-nxCAeTc-DSXFGHCL1eKrkA3E',
  authDomain: 'easy-pedia.firebaseapp.com',
  databaseURL: 'https://easy-pedia.firebaseio.com',
  projectId: 'easy-pedia',
  storageBucket: 'easy-pedia.appspot.com',
  messagingSenderId: '444201218220',
  // Falls back to the Android app id; register a Web app in the console and set
  // VITE_FIREBASE_APP_ID for analytics/messaging. Auth/DB/Storage work either way.
  appId: env.VITE_FIREBASE_APP_ID || '1:444201218220:android:8221b6da25e9c967022f09',
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Inside the native WebView, getAuth() loads the web popup/redirect iframe that
// hangs in Capacitor. Native sign-in goes through SocialLogin, so only a
// persistent store is needed there (same approach as the IMCI app).
function createAuth() {
  if (!Capacitor.isNativePlatform()) return getAuth(app);
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createAuth();
export const db = getDatabase(app);
export const storage = getStorage(app);
