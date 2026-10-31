// Your progress on every quiz and set ({ [pkey]: … }, lib/quizProgress.js),
// for the badges on the quiz lists. Read from the saved copy when offline.
import { useAsync } from './useData';
import { useAuth } from './useAuth';
import { loadQuizProgress } from '../lib/quizHistory';

export function useQuizProgress(enabled = true) {
  const { user } = useAuth();
  const uid = enabled ? user?.uid : null;
  const res = useAsync(() => loadQuizProgress(uid), [uid]);
  return res.data || {};
}
