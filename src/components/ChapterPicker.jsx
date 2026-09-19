// ExamChaptersActivity (type="exam"): pick a chapter / system for a question,
// or add a new one. Picking marks the chapter as part of the collection.
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useList } from '../hooks/useData';
import { updateAt } from '../lib/rtdb';
import { Button, Modal, useToast } from './ui';

export default function ChapterPicker({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState('');
  const toast = useToast();
  const chapters = useList(open ? 'chapters' : null, {
    sort: (a, b) => String(a.chapter || '').localeCompare(String(b.chapter || '')),
  });

  const pick = async (c) => {
    if (String(c.collection) !== 'true') await updateAt(`chapters/${c._key}`, { collection: 'true' }).catch(() => {});
    onChange(c.chapter);
    setOpen(false);
  };

  const add = async () => {
    const name = adding.trim();
    if (!name) return;
    if (/[.#$[\]/]/.test(name)) return toast('Chapter names cannot contain . # $ [ ] /', 'error');
    await updateAt(`chapters/${name}`, { chapter: name, flashcards: 'false', collection: 'true' });
    toast('Chapter added', 'success');
    setAdding('');
    onChange(name);
    setOpen(false);
  };

  const filtered = chapters.data.filter((c) => String(c.chapter || '').toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mb-3">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 text-left rounded-xl border border-slate-300 px-3 py-2.5 bg-white truncate"
        >
          {value || <span className="text-slate-400">Choose…</span>}
        </button>
        {value && (
          <Button variant="outline" type="button" onClick={() => onChange('')}>
            Clear
          </Button>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Choose chapter">
        <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 mb-3">
          <Search size={16} className="text-slate-400" />
          <input className="flex-1 py-2 outline-none" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
          {chapters.loading ? (
            <p className="p-3 text-sm text-slate-400">Loading…</p>
          ) : (
            filtered.map((c) => (
              <button key={c._key} type="button" onClick={() => pick(c)} className="w-full text-left p-3 hover:bg-brand-50">
                {c.chapter}
              </button>
            ))
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <input
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
            placeholder="New chapter name"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          />
          <Button type="button" onClick={add}>
            <Plus size={16} /> Add
          </Button>
        </div>
      </Modal>
    </div>
  );
}
