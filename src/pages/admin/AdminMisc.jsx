// PreviewEditActivity, ShowChapterActivity, EditChapterActivity.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Trash2 } from 'lucide-react';
import { useAsync, useList } from '../../hooks/useData';
import { getOne, getWhere, num, removeAt, updateAt } from '../../lib/rtdb';
import ImageField from '../../components/ImageField';
import DangerConfirm from '../../components/DangerConfirm';
import { AppBar, Button, Card, Empty, ErrorBox, Input, ListCard, Page, SkeletonList, Spinner, Toggle, useToast } from '../../components/ui';

export function Previews() {
  const navigate = useNavigate();
  const list = useList('allquiz', {
    filter: (q) => String(q.preview) === 'true',
    sort: (a, b) => (a._key < b._key ? 1 : -1),
  });
  return (
    <div className="min-h-screen">
      <AppBar title="Preview quizzes" subtitle="Not visible to users until published" />
      <Page className="space-y-3">
        {list.loading ? (
          <SkeletonList />
        ) : list.data.length === 0 ? (
          <Empty title="No quizzes in preview" />
        ) : (
          list.data.map((q) => (
            <ListCard
              key={q._key}
              img={q.img}
              title={q.title}
              subtitle={`${q.source} · ${num(q.number)} questions`}
              onClick={() => navigate(`/admin/quiz/${encodeURIComponent(q._key)}`)}
            />
          ))
        )}
      </Page>
    </div>
  );
}

export function Chapters() {
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const list = useList('chapters', {
    sort: (a, b) => String(a.chapter || '').localeCompare(String(b.chapter || '')),
  });
  const shown = list.data.filter((c) => String(c.chapter || c._key).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="min-h-screen">
      <AppBar title="Chapters / systems" />
      <Page className="space-y-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3">
          <Search size={16} className="text-slate-400" />
          <input className="flex-1 py-2.5 outline-none" placeholder="Search chapters" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.loading ? (
          <SkeletonList />
        ) : (
          shown.map((c) => (
            <ListCard
              key={c._key}
              img={c.chapter_img}
              title={c.chapter || c._key}
              subtitle={String(c.collection) === 'true' ? 'In collection' : 'Not in collection'}
              onClick={() => navigate(`/admin/chapter/${encodeURIComponent(c._key)}`)}
              right={
                <button
                  aria-label="Delete chapter"
                  className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirm(c);
                  }}
                >
                  <Trash2 size={18} />
                </button>
              }
            />
          ))
        )}
      </Page>

      <DangerConfirm
        open={!!confirm}
        busy={busy}
        title="Delete chapter?"
        message={`"${confirm?.chapter || confirm?._key}" will be removed from the chapter list.`}
        impact={['The chapter disappears from the "By system" tab for every user']}
        keeps={[
          'Questions tagged with this chapter name are NOT deleted — they keep their category and stay in their own quizzes',
          'Re-creating a chapter with the same name restores the "By system" quiz',
        ]}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await removeAt(`chapters/${confirm._key}`);
            toast('Chapter deleted', 'success');
            setConfirm(null);
            list.reload();
          } catch (e) {
            toast(e.message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

export function ChapterEditor() {
  const { key } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const chapter = useAsync(() => getOne(`chapters/${key}`), [key]);
  // Sub-types a chapter can belong to = the sub_category values used by books.
  const books = useList('mcqs');
  const types = useMemo(
    () => [...new Set(books.data.map((b) => b.sub_category).filter(Boolean))].sort(),
    [books.data],
  );
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tagged, setTagged] = useState(null); // questions using this chapter name

  useEffect(() => {
    if (chapter.data !== null || !chapter.loading) setForm({ chapter: key, collection: false, chapter_img: '', ...(chapter.data || {}) });
  }, [chapter.data, chapter.loading, key]);

  if (chapter.loading || !form) return <><AppBar title="Chapter" /><Spinner /></>;
  if (chapter.error) return <><AppBar title="Chapter" /><Page><ErrorBox error={chapter.error} /></Page></>;

  const save = async () => {
    setSaving(true);
    try {
      const patch = {
        chapter: form.chapter.trim(),
        collection: form.collection === true || String(form.collection) === 'true' ? 'true' : 'false',
        chapter_img: form.chapter_img || '',
      };
      types.forEach((t) => {
        patch[t] = form[t] === t ? t : null;
      });
      await updateAt(`chapters/${key}`, patch);
      toast('Chapter edited', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppBar title="Edit chapter" subtitle={key} />
      <Page>
        <Card className="p-5">
          <Input
            label="Chapter name"
            hint="Questions are linked by this name (category1 / category2). Renaming does not update existing questions."
            value={form.chapter}
            onChange={(e) => setForm({ ...form, chapter: e.target.value })}
          />
          <ImageField folder="chapter" value={form.chapter_img} onChange={(chapter_img) => setForm({ ...form, chapter_img })} />
          <Toggle
            label="Part of the collection (shown in “By system”)"
            checked={form.collection === true || String(form.collection) === 'true'}
            onChange={(v) => setForm({ ...form, collection: v })}
          />
          {types.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-slate-700">Show in these book types</p>
              {types.map((t) => (
                <Toggle key={t} label={t} checked={form[t] === t} onChange={(v) => setForm({ ...form, [t]: v ? t : null })} />
              ))}
            </div>
          )}
          <Button className="w-full mt-4" onClick={save} loading={saving}>
            Save chapter
          </Button>
          <Button
            variant="outline"
            className="w-full mt-2 !text-red-600"
            onClick={async () => {
              setConfirm(true);
              // Count what references this chapter so the dialog can be specific.
              try {
                const name = chapter.data?.chapter || key;
                const [c1, c2] = await Promise.all([
                  getWhere('quizqq', 'category1', name),
                  getWhere('quizqq', 'category2', name),
                ]);
                setTagged(new Set([...c1, ...c2].map((x) => x._key)).size);
              } catch {
                setTagged(null);
              }
            }}
          >
            <Trash2 size={16} /> Delete chapter
          </Button>
        </Card>
      </Page>

      <DangerConfirm
        open={confirm}
        busy={saving}
        title="Delete chapter?"
        message={`"${form?.chapter || key}" will be removed from the chapter list.`}
        impact={['The chapter disappears from the "By system" tab for every user']}
        keeps={[
          tagged === null
            ? 'Questions tagged with this chapter keep their category and stay in their own quizzes'
            : `${tagged} question(s) tagged with this chapter are NOT deleted — they keep their category and stay in their own quizzes`,
        ]}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setSaving(true);
          try {
            await removeAt(`chapters/${key}`);
            toast('Chapter deleted', 'success');
            navigate(-1);
          } catch (e) {
            toast(e.message, 'error');
            setSaving(false);
          }
        }}
      />
    </div>
  );
}
