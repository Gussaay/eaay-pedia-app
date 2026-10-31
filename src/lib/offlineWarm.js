// Saves your own progress on the device once per launch while online, so it
// is all there the next time the phone has no signal — even for screens you
// did not open this time (see readCache.js).
import { getOneCached, getWhereCached } from './rtdb';
import { isConnectionBroken } from './connectivity';

let warmedFor = null;

export function warmUserCache(uid) {
  if (!uid || warmedFor === uid || isConnectionBroken()) return;
  warmedFor = uid;
  const reads = [
    `quizstats/${uid}`,
    `quizcats/${uid}`,
    `quizperf/${uid}`,
    `quizhistory/${uid}`,
    `flashprogress/${uid}`,
    `flashstats/${uid}`,
  ].map((path) => getOneCached(path).catch(() => null));
  reads.push(getWhereCached('resume', 'uid', uid).catch(() => null));
  Promise.all(reads).catch(() => {});
}
