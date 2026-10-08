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

/**
 * Which questions a session plays, as positions in the loaded list.
 *
 * The old screen only ever played a contiguous slice, so a session was two
 * numbers (start + count). Picking out "the ones I have never seen" or "the
 * ones I got wrong" cannot be expressed that way, so a session is now an
 * explicit list of positions — a slice is just one kind of list.
 *
 * mode: 'all' | 'count' | 'from' | 'unseen' | 'wrong'
 * history: { [question._key]: 1 | 0 } — the last outcome per question.
 */
export function planDeck(questions, mode, value, history = {}) {
  const total = questions.length;
  if (mode === 'unseen' || mode === 'wrong') {
    const deck = [];
    questions.forEach((q, i) => {
      const seen = seenOutcome(history, q);
      if (mode === 'unseen' ? seen === null : seen === 0) deck.push(i);
    });
    if (!deck.length)
      return {
        error:
          mode === 'unseen'
            ? 'You have answered every question in this quiz already.'
            : 'You have no wrong answers left to revisit here.',
      };
    return { deck };
  }
  const p = planSession(total, mode, value);
  if (p.error) return p;
  const deck = [];
  for (let i = p.start; i < Math.min(total, p.start + p.count); i += 1) deck.push(i);
  return { deck };
}

/** 1 (right), 0 (wrong) or null (never answered) for one question. */
function seenOutcome(history, question) {
  const v = history?.[question?._key];
  if (v === undefined || v === null || v === '') return null;
  return num(v) ? 1 : 0;
}

/** How many questions are unseen / wrong / right, for the setup screen. */
export function historyCounts(questions, history = {}) {
  const out = { total: questions.length, unseen: 0, wrong: 0, right: 0 };
  questions.forEach((q) => {
    const seen = seenOutcome(history, q);
    if (seen === null) out.unseen += 1;
    else if (seen) out.right += 1;
    else out.wrong += 1;
  });
  return out;
}

/**
 * The score, counted from the answers themselves rather than kept as a running
 * total. Exam mode lets an answer be changed right up to submission, so a
 * total that was incremented on each tap would count the first choice for ever.
 *
 * `answers` maps a position in the deck to the option chosen there.
 */
export function tallyAnswers(deck, questions, answers) {
  let played = 0;
  let correct = 0;
  Object.entries(answers || {}).forEach(([pos, choice]) => {
    const q = questions[deck[Number(pos)]];
    if (!q || !choice) return;
    played += 1;
    if (isCorrect(q, choice)) correct += 1;
  });
  return { played, correct };
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** A deck as a string, so it fits in the same string-valued database as the rest. */
export const encodeDeck = (deck) => (deck || []).join(',');
export const decodeDeck = (s) =>
  String(s || '')
    .split(',')
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isInteger(n) && n >= 0);

/** Answers as "0:a,3:c". Positions are deck positions, not question numbers. */
export const encodeAnswers = (answers) =>
  Object.entries(answers || {})
    .filter(([, v]) => v)
    .map(([pos, v]) => `${pos}:${v}`)
    .join(',');
export function decodeAnswers(s) {
  const out = {};
  String(s || '')
    .split(',')
    .forEach((pair) => {
      const [pos, choice] = pair.split(':');
      const i = parseInt(pos, 10);
      if (Number.isInteger(i) && choice) out[i] = choice.trim().toLowerCase();
    });
  return out;
}
