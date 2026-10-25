// Client side of the AI study helper: everything goes through the `aiStudy`
// Cloud Function (functions/ai.js), which holds the Groq and Gemini keys. The app never
// sees the key, so there is nothing to extract from the APK.
import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

// The function runs in us-central1, next to the database.
const call = httpsCallable(getFunctions(app, 'us-central1'), 'aiStudy', { timeout: 120_000 });

const MESSAGES = {
  'functions/permission-denied': 'The AI helper is not open to this account.',
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
    let res;
    if (!onText) res = (await call(data)).data;
    else {
      const { stream, data: done } = await call.stream(data, { signal });
      done.catch(() => {}); // a failure surfaces from the stream loop below
      for await (const piece of stream) onText(String(piece));
      res = await done;
    }
    if (res?.quota) setQuota(res.quota);
    return res;
  } catch (e) {
    if (e.details?.quota) setQuota(e.details.quota);
    if (signal?.aborted) throw new Error('Cancelled.');
    throw new Error(MESSAGES[e.code] || e.message || 'AI request failed.');
  }
}

// ------------------------------------------------------------------ quota
// Each person's daily allowance (functions/aiQuota.js). Every reply carries
// the latest figures; `useAiQuota` asks once for them when nothing has yet.
// { unlimited, limit, used, left, active, pool: { total, used, left }, day }
let quota = null;
let asking = null;
const listeners = new Set();

function setQuota(q) {
  quota = q;
  listeners.forEach((fn) => fn(q));
}

export function refreshAiQuota() {
  asking ||= call({ task: 'quota' })
    .then((r) => r.data?.quota && setQuota(r.data.quota))
    .catch(() => {})
    .finally(() => {
      asking = null;
    });
  return asking;
}

/** The signed-in person's AI allowance today, or null until it is known. */
export function useAiQuota() {
  const [q, setQ] = useState(quota);
  useEffect(() => {
    listeners.add(setQ);
    // A new day (Pacific time) brings a fresh allowance.
    if (!quota || quota.day !== new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })) refreshAiQuota();
    return () => listeners.delete(setQ);
  }, []);
  return q;
}
