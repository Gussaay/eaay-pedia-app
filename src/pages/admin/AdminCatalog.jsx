// AddMainCategoryActivity -> AddNewMcqsActivity -> AddNewQuizActivity.
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useList } from '../../hooks/useData';
import { newKey, num, pushTo, updateAt } from '../../lib/rtdb';
import { SUPER_ADMIN_EMAIL } from '../../config';
import ImageField from '../../components/ImageField';
import { AppBar, Button, Card, Empty, Input, ListCard, Modal, Page, SkeletonList, Textarea, Toggle, useToast } from '../../components/ui';

const DB_KEY_RE = /[.#$[\]/]/;

function AddButton({ onClick, children }) {
  return (
    <Button className="w-full" onClick={onClick}>
      <Plus size={18} /> {children}
    </Button>
  );
}

// ---------------------------------------------------------------------------
export function Categories() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const list = useList('main_category');
  const [form, setForm] = useState(null);
  const canAdd = user.email === SUPER_ADMIN_EMAIL;

  const save = async () => {
    if (!form.source.trim()) return toast('Enter source', 'error');
    if (!form.title.trim()) return toast('Enter title', 'error');
    if (DB_KEY_RE.test(form.source)) return toast('Source cannot contain . # $ [ ] /', 'error');
    await pushTo('main_category', {
      title: form.title.trim(),
      source: form.source.trim(),
      type: 'quiz',
      publish: 'true',
      img: form.img,
    });
    toast('Uploaded', 'success');
    setForm(null);
    list.reload();
  };

  const togglePublish = async (c) => {
    await updateAt(`main_category/${c._key}`, { publish: String(c.publish) === 'true' ? 'false' : 'true' });
    list.reload();
  };

  return (
    <div className="min-h-screen">
      <AppBar title="Categories" subtitle="Tap a category to add books to it" />
      <Page className="space-y-3">
        {canAdd ? (
          <AddButton onClick={() => setForm({ title: '', source: '', img: '' })}>Add new category</AddButton>
        ) : (
          <p className="text-sm text-slate-500">Only the main admin can add new sources.</p>
        )}
        {list.loading ? (
          <SkeletonList />
        ) : (
          list.data.map((c) => (
            <ListCard
              key={c._key}
              img={c.img}
              title={c.title}
              subtitle={`source: ${c.source}`}
              onClick={() => navigate(`/admin/category/${encodeURIComponent(c.source)}?title=${encodeURIComponent(c.title || '')}`)}
              badge={
                <span
                  role="switch"
                  aria-checked={String(c.publish) === 'true'}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePublish(c);
                  }}
                  className={`text-xs font-semibold rounded-full px-2 py-1 ${
                    String(c.publish) === 'true' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {String(c.publish) === 'true' ? 'Published' : 'Hidden'}
                </span>
              }
            />
          ))
        )}
      </Page>
      <Modal open={!!form} onClose={() => setForm(null)} title="New category" footer={<Button onClick={save}>Upload</Button>}>
        {form && (
          <>
            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input label="Source (unique id, e.g. nelson)" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            <ImageField folder="source" value={form.img} onChange={(img) => setForm({ ...form, img })} />
          </>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function CategoryBooks() {
  const { source } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const list = useList('mcqs', { filter: (b) => b.main_category === source });
  const [form, setForm] = useState(null);

  const save = async () => {
    if (!form.source.trim()) return toast('Enter source', 'error');
    if (!form.title.trim()) return toast('Enter title', 'error');
    await pushTo('mcqs', {
      title: form.title.trim(),
      source: form.source.trim(),
      sub_category: form.sub_category.trim(),
      img: form.img,
      // Needed so the book shows under its category (McqsMainActivity filter).
      main_category: source,
      type: 'quiz',
    });
    toast('Uploaded', 'success');
    setForm(null);
    list.reload();
  };

  return (
    <div className="min-h-screen">
      <AppBar title={params.get('title') || source} subtitle="Books — tap one to add exams to it" />
      <Page className="space-y-3">
        <AddButton onClick={() => setForm({ title: '', source, sub_category: '', img: '' })}>Add new book</AddButton>
        {list.loading ? (
          <SkeletonList />
        ) : list.data.length === 0 ? (
          <Empty title="No books in this category yet" />
        ) : (
          list.data.map((b) => (
            <ListCard
              key={b._key}
              img={b.img}
              title={b.title}
              subtitle={`source: ${b.source}${b.sub_category ? ` · type: ${b.sub_category}` : ''}`}
              onClick={() =>
                navigate(
                  `/admin/book/${encodeURIComponent(b.source)}?sub=${encodeURIComponent(b.sub_category || '')}&title=${encodeURIComponent(b.title || '')}`,
                )
              }
            />
          ))
        )}
      </Page>
      <Modal open={!!form} onClose={() => setForm(null)} title="New book" footer={<Button onClick={save}>Upload</Button>}>
        {form && (
          <>
            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input label="Source" hint="Quizzes are matched to this book by source." value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            <Input label="Sub-category / type (optional)" hint="Used by collection books (smsb) to split parts." value={form.sub_category} onChange={(e) => setForm({ ...form, sub_category: e.target.value })} />
            <ImageField folder="source" value={form.img} onChange={(img) => setForm({ ...form, img })} />
          </>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function BookQuizzes() {
  const { source } = useParams();
  const [params] = useSearchParams();
  const sub = params.get('sub') || '';
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isCollection = source.includes('smsb');
  const list = useList('allquiz', {
    filter: (q) =>
      isCollection
        ? String(q.source || '').includes(source) && q.type === sub
        : q.source === source,
    sort: (a, b) => (a._key < b._key ? 1 : -1),
  });
  const [form, setForm] = useState(null);

  const open = () =>
    setForm({ title: '', des: '', img: '', uploader: user.email === SUPER_ADMIN_EMAIL ? 'Dr. Qusay Mohamed' : '', preview: true, month: '', year: '' });

  const save = async () => {
    if (!form.title.trim()) return toast('Enter title', 'error');
    if (!form.des.trim()) return toast('Enter description', 'error');
    if (!form.img) return toast('Please upload image', 'error');
    if (source === 'smsb' && (!form.month.trim() || !form.year.trim())) return toast('Enter month and year of the exam', 'error');
    const key = newKey('allquiz');
    const record = {
      title: form.title.trim(),
      des: form.des.trim(),
      img: form.img,
      key,
      uploader: form.uploader.trim(),
      source,
      preview: form.preview ? 'true' : 'false',
      number: '0',
      type: sub,
    };
    if (source === 'smsb') Object.assign(record, { month: form.month.trim(), year: form.year.trim() });
    await pushTo('allquiz', record);
    toast('Uploaded', 'success');
    setForm(null);
    list.reload();
  };

  return (
    <div className="min-h-screen">
      <AppBar title={params.get('title') || source} subtitle="Quizzes — tap one to add questions" />
      <Page className="space-y-3">
        <AddButton onClick={open}>Add new quiz</AddButton>
        {list.loading ? (
          <SkeletonList />
        ) : list.data.length === 0 ? (
          <Empty title="No quizzes in this book yet" />
        ) : (
          list.data.map((q) => (
            <ListCard
              key={q._key}
              img={q.img}
              title={q.title}
              subtitle={`${num(q.number)} questions${String(q.preview) === 'true' ? ' · preview' : ''}`}
              onClick={() => navigate(`/admin/quiz/${encodeURIComponent(q._key)}`)}
            />
          ))
        )}
      </Page>
      <Modal open={!!form} onClose={() => setForm(null)} title="New quiz" footer={<Button onClick={save}>Upload</Button>}>
        {form && (
          <Card className="p-0 border-0 shadow-none">
            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Textarea label="Description" value={form.des} onChange={(e) => setForm({ ...form, des: e.target.value })} />
            <Input label="Uploaded by" value={form.uploader} onChange={(e) => setForm({ ...form, uploader: e.target.value })} />
            {source === 'smsb' && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
                <Input label="Year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
              </div>
            )}
            <ImageField label="Cover image" folder="allquiz_sorage" value={form.img} onChange={(img) => setForm({ ...form, img })} />
            <Toggle label="Save as preview (not visible to users yet)" checked={form.preview} onChange={(v) => setForm({ ...form, preview: v })} />
          </Card>
        )}
      </Modal>
    </div>
  );
}
