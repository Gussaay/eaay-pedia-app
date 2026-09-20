// Profile section: what is saved for offline play, and how to remove it.
import { useCallback, useEffect, useState } from 'react';
import { CloudUpload, DownloadCloud, HardDrive, Trash2 } from 'lucide-react';
import { approxSize, clearOfflineQuizzes, listQuizzes, removeQuiz } from '../lib/offline';
import { flushQueue, usePendingSync } from '../lib/sync';
import { useOnline } from '../hooks/useData';
import { Button, Card, Confirm, useToast } from './ui';

const formatSize = (bytes) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function OfflineDownloads() {
  const [rows, setRows] = useState([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const pending = usePendingSync();
  const online = useOnline();
  const toast = useToast();

  const reload = useCallback(() => listQuizzes().then(setRows), []);
  useEffect(() => {
    reload();
  }, [reload]);

  const manual = rows.filter((r) => r.manual);
  const auto = rows.filter((r) => !r.manual);

  return (
    <Card className="p-5">
      <h3 className="font-display text-lg flex items-center gap-2 text-slate-800">
        <HardDrive size={20} className="text-brand-600" /> Offline
      </h3>
      <p className="text-sm text-slate-500 mt-1">
        Quizzes you open are saved automatically so you can play them without internet. Use “Save for offline”
        on a quiz to keep it permanently.
      </p>

      {pending > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 text-amber-900 p-3 text-sm">
          <CloudUpload size={18} className="shrink-0" />
          <span className="flex-1">
            {pending} result{pending > 1 ? 's' : ''} waiting to be sent
          </span>
          <button className="font-semibold underline disabled:opacity-50" disabled={!online} onClick={() => flushQueue()}>
            Send now
          </button>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xl font-bold text-slate-800">{rows.length}</p>
          <p className="text-xs text-slate-500">quizzes saved</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xl font-bold text-slate-800">{formatSize(approxSize(rows))}</p>
          <p className="text-xs text-slate-500">on this device</p>
        </div>
      </div>

      {manual.length > 0 && (
        <>
          <p className="text-sm font-semibold text-slate-700 mt-4 mb-1">Kept for offline</p>
          <ul className="divide-y divide-slate-100">
            {manual.map((r) => (
              <li key={r.key} className="flex items-center gap-2 py-2">
                <DownloadCloud size={16} className="text-emerald-600 shrink-0" />
                <span className="flex-1 min-w-0 truncate text-slate-800">{r.meta?.title || r.pkey}</span>
                <span className="text-xs text-slate-400">{r.count} Qs</span>
                <button
                  className="p-1 text-slate-400 hover:text-red-600"
                  aria-label="Remove download"
                  onClick={async () => {
                    await removeQuiz(r.key);
                    reload();
                    toast('Removed');
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {auto.length > 0 && (
        <p className="text-xs text-slate-400 mt-3">
          Plus {auto.length} recently opened quiz{auto.length > 1 ? 'zes' : ''} kept automatically.
        </p>
      )}

      {rows.length > 0 && (
        <Button variant="outline" className="w-full mt-4" onClick={() => setConfirmClear(true)}>
          <Trash2 size={16} /> Clear offline data
        </Button>
      )}

      <Confirm
        open={confirmClear}
        danger
        title="Clear offline data?"
        message="Saved quizzes will be removed from this device. Results waiting to be sent are kept."
        confirmText="Clear"
        cancelText="Cancel"
        onCancel={() => setConfirmClear(false)}
        onConfirm={async () => {
          setConfirmClear(false);
          await clearOfflineQuizzes();
          reload();
          toast('Offline data cleared', 'success');
        }}
      />
    </Card>
  );
}
