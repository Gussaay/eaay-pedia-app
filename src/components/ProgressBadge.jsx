// "✓ Done · 72%" (green) or "26/55 · 65%" (amber): how far you got in a quiz
// or set, from lib/quizProgress.js. Nothing for one you have not started.
import { CheckCircle2 } from 'lucide-react';
import { progressLabel } from '../lib/quizProgress';

export default function ProgressBadge({ progress, total, changing = false }) {
  const p = progressLabel(progress, total, { changing });
  if (!p) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${
        p.done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
      }`}
      title={p.score == null ? undefined : 'Your average score over all your attempts'}
    >
      {p.done && <CheckCircle2 size={12} aria-hidden="true" />}
      {p.text}
    </span>
  );
}
