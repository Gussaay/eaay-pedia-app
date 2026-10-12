// Client side of the AI study helper: everything goes through the `aiStudy`
// Cloud Function (functions/ai.js), which holds the Gemini key. The app never
// sees the key, so there is nothing to extract from the APK.
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

// The function runs in us-central1, next to the database.
const call = httpsCallable(getFunctions(app, 'us-central1'), 'aiStudy', { timeout: 120_000 });

const MESSAGES = {
  'functions/permission-denied': 'The AI helper is only available to admins.',
  'functions/unauthenticated': 'Sign in again to use the AI helper.',
  'functions/not-found': 'The AI helper is not deployed yet (firebase deploy --only functions).',
  'functions/unavailable': 'No connection — the AI helper needs internet.',
  'functions/deadline-exceeded': 'Gemini took too long, try again.',
};

export async function askAi(data) {
  try {
    const res = await call(data);
    return res.data;
  } catch (e) {
    throw new Error(MESSAGES[e.code] || e.message || 'AI request failed.');
  }
}
