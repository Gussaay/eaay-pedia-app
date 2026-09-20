// QuizdetailActivity: quiz info, your score, leaderboard, start buttons.
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookOpenCheck, CheckCircle2, DownloadCloud, Timer, Trophy } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync, useOnline } from '../hooks/useData';
import { incrementString, str, updateAt } from '../lib/rtdb';
import { downloadQuiz, loadLeaderboard, loadQuestions, loadQuizMeta, playPath } from '../lib/quizSource';
import { getQuiz, quizKey, removeQuiz } from '../lib/offline';
import { AppBar, Avatar, Button, Card, ErrorBox, Page, Spinner, Thumb, useToast } from '../components/ui';

export default function QuizDetail() {
  const { kind, id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const extra = Object.fromEntries(params);

  const meta = useAsync(() => loadQuizMeta(kind, id, extra), [kind, id, params.toString()]);
  const [count, setCount] = useState(null);
  const [countError, setCountError] = useState(null);
  const [leaders, setLeaders] = useState(null);
  const [saved, setSaved] = useState(null); // offline copy, if any
  const [downloading, setDownloading] = useState(false);
  const online = useOnline();
  const toast = useToast();

  useEffect(() => {
    if (!meta.data) return;
    setCount(null);
    setCountError(null);
    loadQuestions(meta.data)
      .then((qs) => setCount(qs.length))
      .catch((e) => {
        console.error('[QuizDetail] loading questions failed', e);
        setCountError(e);
        setCount(0);
      });
    loadLeaderboard(meta.data.pkey)
      .then(setLeaders)
      .catch(() => setLeaders([]));
    getQuiz(meta.data).then(setSaved).catch(() => setSaved(null));
  }, [meta.data]);

  if (meta.loading) return <><AppBar title="Loading…" /><Spinner /></>;
  if (meta.error)
    return (
      <>
        <AppBar title="Quiz" />
        <Page><ErrorBox error={meta.error} onRetry={meta.reload} /></Page>
      </>
    );

  const q = meta.data;
  const score = profile?.[q.pkey];
  const trials = profile?.[`${q.pkey}_trial`];

  const start = (mode) => {
    // Usage statistics + keep the stored question count in sync (as Android did).
    const statKey = q.bysystem ? q.id : q.pkey;
    incrementString(`statistics/${statKey}/${mode}`).catch(() => {});
    updateAt(`statistics/${statKey}`, { title: q.title }).catch(() => {});
    if (count !== null && count !== q.number) {
      if (q.bysystem) updateAt(`chapters/${q.id}`, { [`${q.type}number`]: str(count) }).catch(() => {});
      else updateAt(`allquiz/${q.id}`, { number: str(count) }).catch(() => {});
    }
    navigate(playPath(kind, id, mode, extra));
  };

  return (
    <div className="min-h-screen">
      <AppBar title={q.name || q.title} />
      <Page className="space-y-4">
        <Card className="p-5">
          <div className="flex gap-4">
            <Thumb src={q.img} label={q.title} className="h-24 w-24 text-2xl" />
            <div className="min-w-0">
              <h2 className="font-display text-xl text-slate-900 leading-snug">{q.title}</h2>
              {q.des && <p className="text-sm text-slate-600 mt-1">{q.des}</p>}
              <p className="text-xs text-slate-500 mt-2">
                uploaded by: <span className="font-semibold">{q.uploader || 'Dr. Qusay Mohamed'}</span>
              </p>
            </div>
          </div>
          <p className="text-center text-brand-700 font-semibold mt-4">
            {count === null ? 'Counting questions…' : countError ? '' : `( ${count} Questions )`}
          </p>
          {countError && (
            <p className="text-center text-sm text-red-600">Could not load questions: {countError.message}</p>
          )}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl bg-brand-50 p-3 text-center">
              <p className="text-xs text-slate-500">Your score is</p>
              <p className="text-2xl font-bold text-brand-800">{score !== undefined ? `${score} %` : '0%'}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-center">
              <p className="text-xs text-slate-500">Achieved in</p>
              <p className="text-2xl font-bold text-amber-700">
                {trials || 0} <span className="text-sm font-normal">trial/s</span>
              </p>
            </div>
          </div>
          <div className="grid gap-3 mt-5">
            <Button className="!py-3" disabled={!count} onClick={() => start('review')}>
              <BookOpenCheck size={20} /> Start with Review mode
            </Button>
            <Button variant="secondary" className="!py-3" disabled={!count} onClick={() => start('exam')}>
              <Timer size={20} /> Start with Exam mode
            </Button>
            {saved?.manual ? (
              <div className="flex items-center justify-center gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <CheckCircle2 size={18} /> Saved for offline
                </span>
                <button
                  className="text-slate-400 hover:text-red-600"
                  onClick={async () => {
                    await removeQuiz(quizKey(q));
                    setSaved(null);
                    toast('Removed from offline downloads');
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="!py-2"
                loading={downloading}
                disabled={!online || !count}
                onClick={async () => {
                  setDownloading(true);
                  try {
                    setSaved(await downloadQuiz(q));
                    toast('Saved for offline use', 'success');
                  } catch (e) {
                    toast(`Could not save: ${e.message}`, 'error');
                  } finally {
                    setDownloading(false);
                  }
                }}
              >
                <DownloadCloud size={18} /> {online ? 'Save for offline' : 'Offline'}
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-display text-lg flex items-center gap-2 text-slate-800">
            <Trophy className="text-amber-500" size={22} /> Points Leaderboard
          </h3>
          {leaders === null ? (
            <Spinner />
          ) : leaders.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">Be the first on the leaderboard!</p>
          ) : (
            <ol className="mt-3 divide-y divide-slate-100">
              {leaders.map((l, i) => (
                <li
                  key={l.uid}
                  className={`flex items-center gap-3 py-2.5 ${l.uid === user.uid ? 'bg-brand-50 -mx-2 px-2 rounded-lg' : ''}`}
                >
                  <span className={`w-6 text-center font-bold ${i < 3 ? 'text-amber-500' : 'text-slate-400'}`}>{i + 1}</span>
                  <Avatar src={l.img} size={36} />
                  <span className="flex-1 truncate text-slate-800">{l.name || 'Anonymous'}</span>
                  <span className="font-semibold text-brand-700">{l.points}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </Page>
    </div>
  );
}
