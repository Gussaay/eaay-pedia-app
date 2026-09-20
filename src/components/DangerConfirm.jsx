// Confirmation for destructive admin actions.
// Deletions here hit live data that thousands of users are studying from, and
// there is no undo, so the dialog states exactly what will be removed, what
// will be left behind, and asks the admin to type the confirm word.
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Modal } from './ui';

export default function DangerConfirm({
  open,
  title = 'Delete?',
  message,
  impact = [],
  keeps = [],
  confirmWord = 'DELETE',
  confirmLabel = 'Delete',
  busy = false,
  onCancel,
  onConfirm,
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const ready = typed.trim().toUpperCase() === confirmWord.toUpperCase();

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      dismissable={!busy}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={!ready} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={22} />
        <div className="min-w-0 flex-1">
          {message && <p className="text-slate-700 whitespace-pre-line">{message}</p>}

          {impact.length > 0 && (
            <ul className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 space-y-1">
              {impact.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          )}
          {keeps.length > 0 && (
            <ul className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 space-y-1">
              {keeps.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-slate-600 mt-4">
            This cannot be undone. Type <b>{confirmWord}</b> to confirm.
          </p>
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>
      </div>
    </Modal>
  );
}
