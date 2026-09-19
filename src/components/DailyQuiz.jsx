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
        className="w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-white p-4 shadow-md animate-pop"
      >
        <CalendarCheck size={28} />
        <span className="font-semibold text-left">Daily Quiz available — tap to test yourself</span>
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

