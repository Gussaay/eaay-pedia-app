// Client side of the AI study helper: everything goes through the `aiStudy`
// Cloud Function (functions/ai.js), which holds the Groq and Gemini keys. The app never
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
  'functions/deadline-exceeded': 'The AI took too long, try again.',
};

/**
 * One request to the helper. With `onText`, the reply streams: each piece of
 * text is passed to it as the AI writes it, and the promise still resolves
 * with the whole reply. `signal` (an AbortController's) cancels it.
 */
export async function askAi(data, { onText, signal } = {}) {
  try {
    if (!onText) return (await call(data)).data;
    const { stream, data: done } = await call.stream(data, { signal });
    done.catch(() => {}); // a failure surfaces from the stream loop below
    for await (const piece of stream) onText(String(piece));
    return await done;
  } catch (e) {
    if (signal?.aborted) throw new Error('Cancelled.');
    throw new Error(MESSAGES[e.code] || e.message || 'AI request failed.');
  }
}
