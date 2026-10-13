// AI tutor conversations kept on the device, one per question, so reopening a
// question shows the earlier explanation and follow-ups instead of asking
// Gemini (and spending quota) again. Oldest entries go once the cap is hit.
import { questionFingerprint } from './aiFormat.js';

const STORE = 'aiTutor.v1';
const MAX = 150;

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch {
    return {};
  }
}

/** The saved messages for a question, or null if none (or it was edited since). */
export function getTutorChat(question) {
  const hit = question?._key && load()[question._key];
  if (!hit || hit.fp !== questionFingerprint(question) || !hit.messages?.length) return null;
  return hit.messages;
}

export function saveTutorChat(question, messages) {
  if (!question?._key) return;
  const all = load();
  if (messages?.length) all[question._key] = { fp: questionFingerprint(question), at: Date.now(), messages };
  else delete all[question._key];
  const keys = Object.keys(all);
  if (keys.length > MAX) {
    keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - MAX).forEach((k) => delete all[k]);
  }
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    // Storage full or blocked: the chat still works, it just won't be kept.
  }
}
