// Pure quiz logic ported from QuizReviewActivity / ResultsActivity.
// Kept free of React and Firebase so it can be unit-tested (npm test).

export const OPTION_KEYS = ['a', 'b', 'c', 'd', 'e'];

/** Options that should be shown for a question (empty ones are hidden). */
export function visibleOptions(question, source = '') {
  return OPTION_KEYS.filter((k) => {
    if (k === 'e' && source === 'smsb') return false; // collection exams have 4 options
    const v = question?.[k];
    return v !== undefined && v !== null && String(v).trim() !== '';
  });
}

export const isCorrect = (question, selected) =>
  !!selected && String(question?.answer || '').trim().toLowerCase() === selected;

/**
 * Which slice of the question bank to play.
 * mode: 'all' | 'count' | 'from'
 *  - count: first N questions (N capped at total)          (Android button20)
 *  - from:  start at question N and play to the end         (Android button23)
 */
export function planSession(total, mode, value) {
  const n = Math.floor(Number(value));
  if (mode === 'count') {
    if (!n || n < 1) return { error: 'Enter a number more than 0' };
    return { start: 0, count: Math.min(n, total) };
  }
  if (mode === 'from') {
    if (!n || n < 1) return { error: 'Enter a number more than 0' };
    if (n > total) return { error: 'Choose a smaller number' };
    return { start: n - 1, count: total - (n - 1) };
  }
  return { start: 0, count: total };
}

/** Exam mode gives 30 seconds per question (Android: tq * 0.5 minutes). */
export const examDurationMs = (count) => Math.round(count * 0.5 * 60 * 1000);

export function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

const trunc = (n) => Math.trunc(Number(n) || 0);

/**
 * Stats written when a session is submitted (Android button1submitall).
 * prev = values currently stored on quizusers/<uid> and quizlead/<uid>.
 * Returns plain numbers; the caller converts them to strings for the DB.
 */
export function computeSessionResult({ correct, played }, prev = {}) {
  if (!played) return null;
  const percentage = trunc((correct / played) * 100);
  const totalPlay = (prev.totalPlay || 0) + played;
  const totalCorrect = (prev.totalCorrect || 0) + correct;
  const overall = trunc((totalCorrect / totalPlay) * 100);
  const trial = (prev.trial || 0) + 1;
  const prevPerf = trunc(prev.quizPerformance || 0);
  const quizPerformance = prevPerf === 0 ? percentage : trunc((prevPerf + percentage) / 2);
  const points = correct;
  return {
    percentage,
    points,
    totalPlay,
    totalCorrect,
    overall,
    trial,
    quizPerformance,
    newBest: points > (prev.previousPoints || 0),
  };
}

/** Result banner (ResultsActivity thresholds). */
export function rating(percentage) {
  if (percentage < 50) return 'poor';
  if (percentage > 80) return 'excellent';
  return 'good';
}

/** Percentages for the daily-quiz statistics bars. */
export function answerStats(dq, key) {
  const read = parseFloat(dq?.[`read${key}`]) || 0;
  const out = {};
  for (const k of OPTION_KEYS) {
    const count = parseFloat(dq?.[`answer ${k.toUpperCase()}${key}`]) || 0;
    out[k] = read ? trunc((count / read) * 100) : 0;
  }
  return out;
}

/** Questions of a "by system" (chapter) quiz: category1/2 = chapter, same type. */
export function matchesChapter(q, chapter, type) {
  return (q.category1 === chapter || q.category2 === chapter) && (!type || q.type === type);
}
