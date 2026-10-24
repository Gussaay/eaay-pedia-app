// How many published quizzes and questions each book holds, from the allquiz
// list, so locked banks and books can show their size without their names.
import { num } from './rtdb';

export function countsBySource(quizzes = []) {
  const out = new Map();
  for (const q of quizzes) {
    if (String(q.preview) !== 'false') continue;
    const c = out.get(q.source) || { quizzes: 0, questions: 0 };
    c.quizzes += 1;
    c.questions += num(q.number);
    out.set(q.source, c);
  }
  return out;
}

/** The totals of several books. */
export function sumCounts(counts, sources = []) {
  return sources.reduce(
    (t, s) => {
      const c = counts.get(s);
      return c ? { quizzes: t.quizzes + c.quizzes, questions: t.questions + c.questions } : t;
    },
    { quizzes: 0, questions: 0 },
  );
}


/** "12 quizzes · 1,450 questions" */
export function countLine({ quizzes = 0, questions = 0 } = {}, extra = '') {
  const q = `${quizzes.toLocaleString()} ${quizzes === 1 ? 'quiz' : 'quizzes'}`;
  const n = `${questions.toLocaleString()} ${questions === 1 ? 'question' : 'questions'}`;
  return [extra, q, n].filter(Boolean).join(' · ');
}
