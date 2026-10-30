// Daily quiz card + dialog (MainPageActivity cardview1 / dailyquiz.xml).
// Reads the latest dailyquizz child; hidden once the user marked it "seen".
import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { limitToLast, onValue, query, ref } from 'firebase/database';
import { db } from '../firebase';
import { incrementString, updateAt } from '../lib/rtdb';
import { answerStats, visibleOptions } from '../lib/quiz';
import { Button, Modal, ZoomImage } from './ui';

/** Latest child of `path` (push keys sort by time), live. */
export function useLatest(path) {
  const [item, setItem] = useState(null);
  useEffect(
    () =>
      onValue(
        query(ref(db, path), limitToLast(1)),
        (snap) => {
          let latest = null;
          snap.forEach((c) => {
            latest = { _key: c.key, ...c.val() };
          });
          setItem(latest);
        },
        () => setItem(null),
      ),
    [path],
  );
  return item;
}

export const useDailyQuiz = () => useLatest('dailyquizz');

export default function DailyQuiz({ daily }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');

  const key = daily?.key || daily?._key;
  const seen = daily && daily[user.uid] === 'seen';
  const options = useMemo(() => (daily ? visibleOptions(daily) : []), [daily]);
  const stats = useMemo(() => answerStats(daily, key), [daily, key]);
  const answer = String(daily?.answer || '').trim().toLowerCase();

  if (!daily || seen || !daily.question) return null;

  const choose = async (k) => {
    if (selected) return;
    setSelected(k);
    const base = `dailyquizz/${daily._key}`;
    await Promise.all([
      incrementString(`${base}/answer ${k.toUpperCase()}${key}`),
      incrementString(`${base}/read${key}`),
    ]).catch(() => {});
  };

  const done = async () => {
    setOpen(false);
    await updateAt(`dailyquizz/${daily._key}`, { [user.uid]: 'seen' }).catch(() => {});
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative w-full overflow-hidden flex items-center gap-4 rounded-3xl bg-gradient-to-r from-brand-50 to-sky-50 border border-brand-100 p-4 text-left shadow-sm active:scale-[0.99] transition"
      >
        <span className="absolute -right-6 -bottom-12 h-28 w-28 rounded-full bg-white/70" />
        <div className="relative h-12 w-12 shrink-0 rounded-2xl bg-brand-600 text-white shadow-md shadow-brand-600/30 flex items-center justify-center">
          <CalendarCheck size={26} />
        </div>
        <div className="relative flex-1 min-w-0">
          <p className="font-display text-lg leading-tight text-slate-900">Question of the day</p>
          <p className="text-sm text-slate-600">Answer it and see how everyone else did</p>
        </div>
        <span className="relative rounded-full bg-brand-600 text-white text-sm font-bold px-3.5 py-1.5 shrink-0">Try it</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} dismissable={!selected} title="Daily Quiz">
        <p className="text-slate-900 font-medium whitespace-pre-line">{daily.question}</p>
        <ZoomImage src={daily.question_img} className="mt-3" />
        <div className="mt-4 space-y-2">
          {options.map((k) => {
            const isAns = selected && k === answer;
            const isWrong = selected && k === selected && k !== answer;
            return (
              <button
                key={k}
                disabled={!!selected}
                onClick={() => choose(k)}
                className={`w-full text-left rounded-xl border-2 p-3 transition ${
                  isAns
                    ? 'border-emerald-500 bg-emerald-50'
                    : isWrong
                      ? 'border-red-500 bg-red-50'
                      : 'border-slate-200 hover:border-brand-400'
                }`}
              >
                <div className="flex gap-2">
                  <span className="font-bold uppercase text-brand-700">{k}.</span>
                  <span className="flex-1">{daily[k]}</span>
                  {selected && <span className="text-sm font-semibold text-slate-500">{stats[k]}%</span>}
                </div>
                {selected && (
                  <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500" style={{ width: `${stats[k]}%` }} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {selected && (
          <div className="mt-4 rounded-xl bg-brand-50 p-3">
            <p className="font-semibold text-brand-900">Correct answer is: {answer.toUpperCase()}</p>
            {daily.exp && <p className="text-slate-700 mt-2 whitespace-pre-line">{daily.exp}</p>}
            <ZoomImage src={daily.exp_img} className="mt-3" />
          </div>
        )}
        <div className="flex gap-2 justify-end mt-4">
          {!selected ? (
            <Button variant="outline" onClick={() => setOpen(false)}>
              Later
            </Button>
          ) : (
            <Button onClick={done}>Done</Button>
          )}
        </div>
      </Modal>
    </>
  );
}

