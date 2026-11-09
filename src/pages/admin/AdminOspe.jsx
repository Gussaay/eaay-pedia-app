// Admin: review OSPE picture cards. Auto captions are written by a model from
// the question text, so they wait here in the "Auto" tab until a person checks
// them; "Waiting" cards have no caption yet. Users only see checked and auto.
import { useMemo, useState } from 'react';
import { Images } from 'lucide-react';
import { useAsync } from '../../hooks/useData';
import { CHAPTERS } from '../../lib/questionBrowse';
import { tagSlug } from '../../lib/topicTags';
import { OSPE_KINDS, loadAllOspeCards, saveOspeCard } from '../../lib/ospeData';
import { OspePicture } from '../../components/OspeCard';
import { AppBar, Button, Empty, ErrorBox, Input, Modal, Page, Select, SkeletonList, Textarea, useToast } from '../../components/ui';

const TABS = [
  { key: 'waiting', label: 'Waiting' },
  { key: 'auto', label: 'Auto (to check)' },
  { key: 'checked', label: 'Checked' },
  { key: 'hidden', label: 'Hidden' },
];

function EditSheet({ card, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    title: card.title || '',
    caption: card.caption || '',
    kind: card.kind || 'other',
    chapter: card.chapter || '',
    topic_label: card.topic_label || '',
    credit: card.credit || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async (status) => {
    setBusy(true);
    try {
      const patch = {
        ...f,
        title: f.title.trim(),
        caption: f.caption.trim(),
        topic_label: f.topic_label.trim(),
        credit: f.credit.trim(),
        topic: tagSlug(f.topic_label),
        updated: Date.now(),
      };
      if (status) patch.status = status;
      await saveOspeCard(card._key, patch);
      onSaved({ ...card, ...patch });
    } catch (e) {
      toast(e.message || 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Edit picture card">
      <OspePicture src={card.img} className="mx-auto mb-3 max-h-56" />
      <Input label="Title" value={f.title} onChange={set('title')} />
      <Textarea label="Caption" value={f.caption} onChange={set('caption')} />
      <Select label="Kind" value={f.kind} onChange={set('kind')}>
        {OSPE_KINDS.map((k) => (
          <option key={k.key} value={k.key}>{k.label}</option>
        ))}
      </Select>
      <Select label="Chapter" value={f.chapter} onChange={set('chapter')}>
        <option value="">Other (none)</option>
        {CHAPTERS.filter((c) => c !== 'Other').map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </Select>
      <Input label="Topic" hint={`Slug: ${tagSlug(f.topic_label) || '(none)'}`} value={f.topic_label} onChange={set('topic_label')} />
      <Input label="Picture credit" value={f.credit} onChange={set('credit')} />
      <div className="flex flex-wrap gap-2">
        <Button loading={busy} onClick={() => save()}>Save</Button>
        <Button loading={busy} variant="outline" onClick={() => save('checked')}>Mark checked</Button>
        {card.status === 'hidden' ? (
          <Button loading={busy} variant="outline" onClick={() => save(card.title && card.caption ? 'checked' : 'waiting')}>Unhide</Button>
        ) : (
          <Button loading={busy} variant="outline" onClick={() => save('hidden')}>Hide</Button>
        )}
      </div>
    </Modal>
  );
}

export default function AdminOspe() {
  const data = useAsync(loadAllOspeCards, []);
  const [tab, setTab] = useState('auto');
  const [edit, setEdit] = useState(null);
  const [changes, setChanges] = useState({});

  const cards = useMemo(() => (data.data || []).map((c) => changes[c._key] || c), [data.data, changes]);
  const counts = (k) => cards.filter((c) => c.status === k).length;
  const rows = cards.filter((c) => c.status === tab);
  const kindLabel = (k) => OSPE_KINDS.find((x) => x.key === k)?.label || k || 'Other';

  return (
    <div className="min-h-screen pb-10">
      <AppBar title="OSPE cards" subtitle={cards.length ? `${cards.length} cards` : undefined} />
      <Page className="space-y-3">
        <ErrorBox error={data.error} onRetry={data.reload} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${tab === t.key ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700'}`}
            >
              {t.label} ({counts(t.key)})
            </button>
          ))}
        </div>
        {data.loading ? (
          <SkeletonList />
        ) : rows.length === 0 ? (
          <Empty icon={<Images size={40} />} title="Nothing here" />
        ) : (
          rows.map((c) => (
            <button
              key={c._key}
              onClick={() => setEdit(c)}
              className="w-full text-left flex gap-3 bg-white rounded-2xl p-3 border border-slate-100 shadow-sm hover:shadow-md"
            >
              <OspePicture src={c.img} className="h-20 w-20 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800 leading-snug">{c.title || '(no title yet)'}</p>
                {c.caption && <p className="text-xs text-slate-600 line-clamp-2">{c.caption}</p>}
                <p className="mt-1 text-[11px] text-slate-500">
                  {kindLabel(c.kind)} · {c.chapter || 'Other'} · {Object.keys(c.sources || {}).length} source{Object.keys(c.sources || {}).length === 1 ? '' : 's'}
                </p>
              </div>
            </button>
          ))
        )}
      </Page>
      {edit && (
        <EditSheet
          card={edit}
          onClose={() => setEdit(null)}
          onSaved={(c) => {
            setChanges((x) => ({ ...x, [c._key]: c }));
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}
