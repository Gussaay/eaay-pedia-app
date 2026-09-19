// Question fields shared by the quick editor (EditActivity) and the admin
// add/edit screens (AddNewQuestionActivity / EditQuestionsActivity).
import { useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { uploadImage } from '../lib/rtdb';
import { OPTION_KEYS } from '../lib/quiz';
import { Button, Textarea, ZoomImage, useToast } from './ui';
import ChapterPicker from './ChapterPicker';

export const emptyQuestion = {
  question: '', a: '', b: '', c: '', d: '', e: '', answer: '', exp: '', exp_img: '', category1: '', category2: '',
};

export function validateQuestion(q, { requireCategory } = {}) {
  if (!q.question.trim()) return 'Enter question';
  if (!q.a.trim()) return 'Enter option A';
  if (!q.b.trim()) return 'Enter option B';
  if (!q.answer) return 'Select correct answer';
  if (!String(q[q.answer] || '').trim()) return 'The correct answer option is empty';
  if (requireCategory && !q.category1) return 'Select category';
  return null;
}

export default function QuestionForm({ value, onChange, showCategories = false }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const set = (k, v) => onChange({ ...value, [k]: v });

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      set('exp_img', await uploadImage('question_storage', file));
    } catch (err) {
      toast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div>
      <Textarea label="Question" rows={4} value={value.question} onChange={(e) => set('question', e.target.value)} />
      <p className="text-sm font-medium text-slate-700 mb-1">Options — tick the correct answer</p>
      {OPTION_KEYS.map((k) => (
        <div key={k} className="flex items-start gap-2 mb-2">
          <label className="pt-3 flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="answer"
              className="h-5 w-5 accent-emerald-600"
              checked={value.answer === k}
              onChange={() => set('answer', k)}
            />
            <span className="font-bold uppercase w-4 text-brand-700">{k}</span>
          </label>
          <textarea
            rows={1}
            className={`flex-1 rounded-xl border px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400 ${
              value.answer === k ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300'
            }`}
            placeholder={k === 'c' || k === 'd' || k === 'e' ? `Option ${k.toUpperCase()} (optional)` : `Option ${k.toUpperCase()}`}
            value={value[k] || ''}
            onChange={(e) => set(k, e.target.value)}
          />
        </div>
      ))}
      <Textarea label="Explanation" rows={4} value={value.exp} onChange={(e) => set('exp', e.target.value)} />
      <div className="mb-4">
        <span className="block text-sm font-medium text-slate-700 mb-1">Explanation image</span>
        {value.exp_img ? (
          <div className="space-y-2">
            <ZoomImage src={value.exp_img} />
            <Button variant="outline" onClick={() => set('exp_img', '')}>
              <Trash2 size={16} /> Remove image
            </Button>
          </div>
        ) : (
          <label className="inline-flex items-center gap-2 text-brand-700 font-semibold cursor-pointer">
            <ImagePlus size={18} /> {uploading ? 'Uploading…' : 'Upload image'}
            <input type="file" accept="image/*" className="hidden" onChange={upload} disabled={uploading} />
          </label>
        )}
      </div>
      {showCategories && (
        <div className="grid sm:grid-cols-2 gap-3">
          <ChapterPicker label="Category 1 (system)" value={value.category1} onChange={(v) => set('category1', v)} />
          <ChapterPicker label="Category 2 (optional)" value={value.category2} onChange={(v) => set('category2', v)} />
        </div>
      )}
    </div>
  );
}
