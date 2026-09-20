// EditMainDetailsActivity + AddNewQuestionActivity + EditQuestionsActivity.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eraser, Plus, Trash2, Upload } from 'lucide-react';
import { useAsync } from '../../hooks/useData';
import { getOne, getWhere, pushTo, removeAt, removePaths, str, updateAt } from '../../lib/rtdb';
import { invalidateQuestions } from '../../lib/quizSource';
import ImageField from '../../components/ImageField';
import QuestionForm, { emptyQuestion, validateQuestion } from '../../components/QuestionForm';
import ImportQuestionsModal from '../../components/ImportQuestionsModal';
import DangerConfirm from '../../components/DangerConfirm';
import { AppBar, Button, Card, Confirm, ErrorBox, Input, Page, Spinner, Textarea, Toggle, useToast } from '../../components/ui';

async function loadQuiz(childKey) {
  const quiz = await getOne(`allquiz/${childKey}`);
  if (!quiz) throw new Error('Quiz not found (it may have been deleted).');
  const questions = await getWhere('quizqq', 'key', quiz.key);
  questions.sort((a, b) => (a._key < b._key ? -1 : 1));
  return { quiz, questions };
}

const syncCount = (childKey, quiz, n) => {
  invalidateQuestions({ kind: 'exam', pkey: quiz.key });
  return updateAt(`allquiz/${childKey}`, { number: str(n) });
};

// ---------------------------------------------------------------------------
export function QuizEditor() {
  const { childKey } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const data = useAsync(() => loadQuiz(childKey), [childKey]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false); // destructive actions in progress

  useEffect(() => {
    if (data.data)
      setForm({
        title: '', des: '', img: '', uploader: '', source: '', type: '', month: '', year: '',
        ...data.data.quiz,
        preview: String(data.data.quiz.preview) === 'true',
      });
  }, [data.data]);

  if (data.loading || !form) return <><AppBar title="Edit quiz" />{data.error ? <Page><ErrorBox error={data.error} /></Page> : <Spinner />}</>;

  const { quiz, questions } = data.data;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    if (!form.title.trim()) return toast('Enter title', 'error');
    if (!form.des.trim()) return toast('Enter description', 'error');
    setSaving(true);
    try {
      await updateAt(`allquiz/${childKey}`, {
        title: form.title.trim(),
        des: form.des.trim(),
        img: form.img,
        uploader: form.uploader,
        source: form.source,
        preview: form.preview ? 'true' : 'false',
        number: str(questions.length),
        type: form.type,
        month: form.month || '',
        year: form.year || '',
      });
      toast('Saved', 'success');
    } finally {
      setSaving(false);
    }
  };

  // Deleting the quiz record alone leaves its questions in the database, which
  // is what the admin wants when a quiz is being rebuilt, so removing them is a
  // separate explicit choice.
  const deleteQuiz = async (withQuestions) => {
    if (withQuestions && questions.length) {
      await removePaths(questions.map((q) => `quizqq/${q._key}`));
    }
    await removeAt(`allquiz/${childKey}`);
    invalidateQuestions({ kind: 'exam', pkey: quiz.key });
    toast(withQuestions ? 'Quiz and its questions deleted' : 'Quiz deleted', 'success');
    navigate(-1);
  };

  // One atomic write, so a dropped connection cannot leave half a quiz behind.
  const deleteAllQuestions = async () => {
    await removePaths(questions.map((q) => `quizqq/${q._key}`));
    await syncCount(childKey, quiz, 0);
    toast(`${questions.length} questions deleted`, 'success');
    data.reload();
  };

  const deleteQuestion = async (q) => {
    await removeAt(`quizqq/${q._key}`);
    await syncCount(childKey, quiz, questions.length - 1);
    toast('Question deleted', 'success');
    data.reload();
  };

  return (
    <div className="min-h-screen">
      <AppBar title="Edit quiz" subtitle={quiz.title} />
      <Page className="space-y-4">
        <Card className="p-5">
          <Input label="Title" value={form.title} onChange={set('title')} />
          <Textarea label="Description" value={form.des} onChange={set('des')} />
          <Input label="Uploaded by" value={form.uploader} onChange={set('uploader')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Source" value={form.source} onChange={set('source')} />
            <Input label="Type / sub-category" value={form.type} onChange={set('type')} />
            <Input label="Month" value={form.month} onChange={set('month')} />
            <Input label="Year" value={form.year} onChange={set('year')} />
          </div>
          <ImageField label="Cover image" folder="quiz_cover" value={form.img} onChange={(img) => setForm({ ...form, img })} />
          <Toggle label="Preview only (hidden from users)" checked={form.preview} onChange={(v) => setForm({ ...form, preview: v })} />
          <div className="flex gap-2 mt-3">
            <Button className="flex-1" onClick={save} loading={saving}>Save details</Button>
            <Button variant="danger" onClick={() => setConfirm({ kind: 'quiz', withQuestions: false })}>
              <Trash2 size={16} /> Delete quiz
            </Button>
            {questions.length > 0 && (
              <Button variant="outline" className="!text-red-600" onClick={() => setConfirm({ kind: 'quiz', withQuestions: true })}>
                + questions
              </Button>
            )}
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-2 justify-between">
          <h2 className="font-display text-lg">Questions ({questions.length})</h2>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Upload size={18} /> Import
            </Button>
            {questions.length > 0 && (
              <Button variant="outline" className="!text-red-600" onClick={() => setConfirm({ kind: 'all-questions' })}>
                <Eraser size={18} /> Delete all
              </Button>
            )}
            <Button onClick={() => navigate(`/admin/quiz/${encodeURIComponent(childKey)}/question/new`)}>
              <Plus size={18} /> Add question
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={q._key} className="flex items-start gap-2 bg-white rounded-xl border border-slate-100 p-3">
              <button
                className="flex-1 text-left"
                onClick={() => navigate(`/admin/quiz/${encodeURIComponent(childKey)}/question/${q._key}`)}
              >
                <span className="text-xs font-semibold text-brand-700">Q{i + 1} · answer {String(q.answer || '?').toUpperCase()}</span>
                <p className="text-slate-800 line-clamp-2">{q.question}</p>
              </button>
              <button className="p-2 text-slate-400 hover:text-red-600" aria-label="Delete question" onClick={() => setConfirm({ kind: 'question', q })}>
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      </Page>
      {importing && (
        <ImportQuestionsModal
          quiz={quiz}
          childKey={childKey}
          existingQuestions={questions}
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            invalidateQuestions({ kind: 'exam', pkey: quiz.key });
            data.reload();
          }}
        />
      )}
      {/* A single question is a small, obvious action: a plain confirm is enough. */}
      <Confirm
        open={confirm?.kind === 'question'}
        danger
        title="Delete question?"
        message={confirm?.q?.question}
        confirmText="Delete"
        cancelText="Cancel"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm;
          setConfirm(null);
          await deleteQuestion(c.q);
        }}
      />

      <DangerConfirm
        open={confirm?.kind === 'all-questions'}
        busy={busy}
        title="Delete all questions?"
        confirmLabel={`Delete ${questions.length} questions`}
        message={`All ${questions.length} questions in "${quiz.title}" will be deleted.`}
        impact={[`${questions.length} questions removed from the database`, 'The quiz stays, with a question count of 0']}
        keeps={['Scores users already earned on this quiz are kept']}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await deleteAllQuestions();
            setConfirm(null);
          } catch (e) {
            toast(e.message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      />

      <DangerConfirm
        open={confirm?.kind === 'quiz'}
        busy={busy}
        title="Delete quiz?"
        message={`"${quiz.title}" will disappear from the app for every user.`}
        impact={[
          'The quiz is removed from its book immediately',
          confirm?.withQuestions
            ? `Its ${questions.length} questions are deleted too`
            : `Its ${questions.length} questions stay in the database`,
        ]}
        keeps={['Scores and leaderboard entries users already earned are kept']}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await deleteQuiz(!!confirm.withQuestions);
          } catch (e) {
            toast(e.message, 'error');
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function QuestionEditorPage() {
  const { childKey, qid } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const data = useAsync(() => loadQuiz(childKey), [childKey]);
  const [value, setValue] = useState(emptyQuestion);
  const [saving, setSaving] = useState(false);
  const isNew = qid === 'new';

  const questions = data.data?.questions || [];
  const quiz = data.data?.quiz;
  const pos = questions.findIndex((q) => q._key === qid);

  useEffect(() => {
    if (!data.data) return;
    if (isNew) {
      setValue(emptyQuestion);
      return;
    }
    const q = questions.find((x) => x._key === qid);
    if (q) {
      const v = { ...emptyQuestion };
      Object.keys(v).forEach((k) => {
        if (q[k] !== undefined) v[k] = String(q[k]);
      });
      v.answer = v.answer.trim().toLowerCase();
      setValue(v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.data, qid]);

  if (data.loading) return <><AppBar title="Question" /><Spinner /></>;
  if (data.error) return <><AppBar title="Question" /><Page><ErrorBox error={data.error} /></Page></>;

  const requireCategory = quiz.source === 'smsb';

  const save = async () => {
    const err = validateQuestion(value, { requireCategory });
    if (err) return toast(err, 'error');
    setSaving(true);
    try {
      const record = {
        question: value.question,
        a: value.a, b: value.b, c: value.c, d: value.d, e: value.e,
        exp: value.exp,
        answer: value.answer,
        category1: value.category1,
        category2: value.category2,
        type: quiz.type || '',
        title: quiz.title || '',
        exp_img: value.exp_img,
      };
      if (isNew) {
        await pushTo('quizqq', { key: quiz.key, source: quiz.source || '', ...record });
        await syncCount(childKey, quiz, questions.length + 1);
        toast('Question added', 'success');
        // Stay on the form to add the next one, keeping the chosen categories.
        setValue({ ...emptyQuestion, category1: value.category1, category2: value.category2 });
        data.reload();
        window.scrollTo({ top: 0 });
      } else {
        await updateAt(`quizqq/${qid}`, record);
        invalidateQuestions({ kind: 'exam', pkey: quiz.key });
        toast('Question edited', 'success');
        data.reload();
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const goTo = (i) => navigate(`/admin/quiz/${encodeURIComponent(childKey)}/question/${questions[i]._key}`, { replace: true });

  return (
    <div className="min-h-screen pb-24">
      <AppBar
        title={isNew ? `New question ${questions.length + 1}` : `Question ${pos + 1} of ${questions.length}`}
        subtitle={quiz.title}
      />
      <Page>
        <Card className="p-5">
          <QuestionForm value={value} onChange={setValue} showCategories />
        </Card>
      </Page>
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 pb-safe">
        <div className="max-w-3xl mx-auto flex gap-2 p-3">
          {!isNew && (
            <Button variant="outline" disabled={pos <= 0} onClick={() => goTo(pos - 1)} aria-label="Previous question">
              <ChevronLeft size={18} />
            </Button>
          )}
          <Button className="flex-1" onClick={save} loading={saving}>
            {isNew ? 'Add question' : 'Save changes'}
          </Button>
          {!isNew && (
            <Button variant="outline" disabled={pos >= questions.length - 1} onClick={() => goTo(pos + 1)} aria-label="Next question">
              <ChevronRight size={18} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
