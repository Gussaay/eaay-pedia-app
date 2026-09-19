// Admin quick edit from inside a quiz (EditActivity).
import { useState } from 'react';
import { updateAt } from '../lib/rtdb';
import { Button, Modal, useToast } from './ui';
import QuestionForm, { emptyQuestion, validateQuestion } from './QuestionForm';

export default function QuestionEditModal({ question, onClose, onSaved }) {
  const toast = useToast();
  const [value, setValue] = useState(() => {
    const v = { ...emptyQuestion };
    Object.keys(v).forEach((k) => {
      if (question[k] !== undefined) v[k] = String(question[k]);
    });
    v.answer = v.answer.trim().toLowerCase();
    return v;
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const err = validateQuestion(value);
    if (err) return toast(err, 'error');
    setSaving(true);
    try {
      const patch = {
        question: value.question,
        a: value.a, b: value.b, c: value.c, d: value.d, e: value.e,
        answer: value.answer,
        exp: value.exp,
        exp_img: value.exp_img,
      };
      await updateAt(`quizqq/${question._key}`, patch);
      toast('Question edited successfully', 'success');
      onSaved(patch);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Edit question"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </>
      }
    >
      <QuestionForm value={value} onChange={setValue} />
    </Modal>
  );
}
