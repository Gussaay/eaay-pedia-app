// Sends results that were finished without a connection.
// Each pending item keeps only what the user actually did (correct / played);
// totals are recalculated against the current server values when it is sent,
// so a result that waited never overwrites newer progress.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Network } from '@capacitor/network';
import { auth } from '../firebase';
import { getOne, num, str, updateAt } from './rtdb';
import { computeSessionResult } from './quiz';
import { listQueue, removeQueued, queueResult } from './offline';

const listeners = new Set();
let pendingCount = 0;
let flushing = false;

const emit = () => listeners.forEach((l) => l());
export function usePendingSync() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pendingCount,
  );
}

export async function refreshPendingCount() {
  pendingCount = (await listQueue()).length;
  emit();
  return pendingCount;
}

/** Saves a finished session to send later. */
export async function queuePendingResult(result) {
  await queueResult(result);
  await refreshPendingCount();
}

async function sendOne(item) {
  const uid = item.uid || auth.currentUser?.uid;
  if (!uid) throw new Error('not signed in');
  const [user, lead] = await Promise.all([
    getOne(`quizusers/${uid}`),
    getOne(`quizlead/${uid}/${item.pkey}`),
  ]);
  const r = computeSessionResult(
    { correct: item.correct, played: item.played },
    {
      totalPlay: num(user?.total_play),
      totalCorrect: num(user?.total_correct),
      trial: num(user?.[`${item.pkey}_trial`]),
      quizPerformance: num(user?.[item.pkey]),
      previousPoints: num(lead),
    },
  );
  if (!r) return;
  const writes = [
    updateAt(`quizusers/${uid}`, {
      total_play: str(r.totalPlay),
      total_correct: str(r.totalCorrect),
      over_all: str(r.overall),
      [item.pkey]: str(r.quizPerformance),
      [`${item.pkey}_trial`]: str(r.trial),
    }),
  ];
  if (r.newBest) {
    writes.push(
      updateAt(`quizlead/${uid}`, {
        [item.pkey]: str(r.points),
        name: item.name || '',
        img: item.img || '',
        uid,
      }),
    );
  }
  await Promise.all(writes);
}

/** Sends everything that is waiting. Safe to call often. */
export async function flushQueue() {
  if (flushing || !auth.currentUser) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  flushing = true;
  try {
    const items = await listQueue();
    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await sendOne(item);
        // eslint-disable-next-line no-await-in-loop
        await removeQueued(item.id);
      } catch (e) {
        console.warn('[sync] could not send a saved result yet:', e?.message || e);
        break; // still offline or rules problem: try again later
      }
    }
    await refreshPendingCount();
  } finally {
    flushing = false;
  }
}

/** Flushes on start, when the connection returns and when the tab is shown. */
export function useSyncPendingResults(user) {
  useEffect(() => {
    if (!user) return undefined;
    refreshPendingCount().then(() => flushQueue());
    let handle;
    Network.addListener('networkStatusChange', (s) => {
      if (s.connected) flushQueue();
    }).then((h) => {
      handle = h;
    });
    const onVisible = () => document.visibilityState === 'visible' && flushQueue();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', flushQueue);
    return () => {
      handle?.remove();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', flushQueue);
    };
  }, [user]);
}

/** Small helper for screens that want the count without subscribing to changes. */
export function usePendingCountOnce() {
  const [n, setN] = useState(0);
  useEffect(() => {
    refreshPendingCount().then(setN);
  }, []);
  return n;
}
