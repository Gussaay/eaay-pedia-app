// The visible half of src/lib/downloads.js: what has been downloaded, how far
// a running download has got, and a way to open or remove each one.
import { useSyncExternalStore } from 'react';
import { CheckCircle2, Download, FileDown, RotateCw, Trash2, XCircle } from 'lucide-react';
import {
  clearFinishedDownloads,
  downloadStore,
  openDownload,
  removeDownload,
  retryDownload,
} from '../lib/downloads';
import { isNative } from '../lib/native';
import { Card, Empty } from './ui';

const when = (ts) => {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ts).toLocaleDateString();
};

function Row({ item }) {
  const busy = item.status === 'downloading';
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${
            item.status === 'done'
              ? 'bg-emerald-50 text-emerald-600'
              : item.status === 'error'
                ? 'bg-red-50 text-red-600'
                : 'bg-brand-50 text-brand-600'
          }`}
        >
          {item.status === 'done' ? (
            <CheckCircle2 size={20} />
          ) : item.status === 'error' ? (
            <XCircle size={20} />
          ) : (
            <FileDown size={20} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800 truncate">{item.title || item.fileName}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {busy
              ? `Downloading… ${item.progress || 0}%${item.size ? ` of ${item.size}` : ''}`
              : item.status === 'error'
                ? item.error || 'Failed'
                : `Ready to install · ${when(item.at)}`}
          </p>

          {busy && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-brand-600 transition-all duration-300"
                style={{ width: `${Math.max(3, item.progress || 0)}%` }}
              />
            </div>
          )}
        </div>

        {!busy && (
          <div className="flex shrink-0 gap-1">
            {item.status === 'done' && (
              <button
                onClick={() => openDownload(item.id)}
                className="p-2 rounded-lg text-brand-700 hover:bg-brand-50"
                aria-label="Open"
                title="Open"
              >
                <Download size={18} />
              </button>
            )}
            {item.status === 'error' && (
              <button
                onClick={() => retryDownload(item.id)}
                className="p-2 rounded-lg text-brand-700 hover:bg-brand-50"
                aria-label="Retry"
                title="Retry"
              >
                <RotateCw size={18} />
              </button>
            )}
            <button
              onClick={() => removeDownload(item.id)}
              className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
              aria-label="Remove"
              title="Remove"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DownloadManager() {
  const items = useSyncExternalStore(downloadStore.subscribe, downloadStore.getSnapshot, () => []);

  if (!isNative) return null;

  const finished = items.filter((d) => d.status !== 'downloading');

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg">Downloads</p>
        {finished.length > 0 && (
          <button onClick={clearFinishedDownloads} className="text-sm text-slate-500 hover:text-red-600">
            Clear
          </button>
        )}
      </div>
      <p className="text-sm text-slate-500 mt-1">
        Installers downloaded inside the app. Tap one to install it again — you do not need to open
        the Downloads folder.
      </p>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <Empty icon={<FileDown size={32} />} title="Nothing downloaded yet" />
        ) : (
          items.map((item) => <Row key={item.id} item={item} />)
        )}
      </div>
    </Card>
  );
}
