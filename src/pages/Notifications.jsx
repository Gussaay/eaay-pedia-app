// NotificationsActivity: all_notification, newest first. Opening one marks it
// "seen" for this user and counts a read; the action button counts a click.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff, ExternalLink } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useData';
import { getLatest, incrementString, updateAt } from '../lib/rtdb';
import { openUrl } from '../lib/native';
import { AppBar, Button, Empty, ErrorBox, Modal, Page, SkeletonList, ZoomImage } from '../components/ui';

const hasContent = (n) => !!(n && (n.title || n.message));

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Each notification stores a "<uid>: seen" flag per reader, so the node grows
  // with the user count: only fetch the newest ones.
  // Records with no title/message are counter leftovers (read/click/seen only).
  const latest = useAsync(
    () => getLatest('all_notification', 30).then((l) => l.filter(hasContent)),
    [],
  );
  const list = { data: latest.data || [], loading: latest.loading, error: latest.error, reload: latest.reload };
  const [open, setOpen] = useState(null);
  const [seenLocal, setSeenLocal] = useState({});

  const nodeKey = (n) => n.key || n._key;
  const isSeen = (n) => n[user.uid] === 'seen' || seenLocal[n._key];

  const show = (n) => {
    setOpen(n);
    setSeenLocal((s) => ({ ...s, [n._key]: true }));
    updateAt(`all_notification/${nodeKey(n)}`, { [user.uid]: 'seen' }).catch(() => {});
    incrementString(`all_notification/${nodeKey(n)}/read`).catch(() => {});
  };

  const act = (n) => {
    incrementString(`all_notification/${nodeKey(n)}/click`).catch(() => {});
    setOpen(null);
    if (n.type === 'ad') {
      if (n.link) openUrl(/^https?:\/\//.test(n.link) ? n.link : `https://${n.link}`);
    } else if (n.source) {
      navigate(`/cat/${encodeURIComponent(n.source)}?title=${encodeURIComponent('New MCQs')}`);
    }
  };

  return (
    <div className="min-h-screen">
      <AppBar title="Notifications" />
      <Page>
        <ErrorBox error={!list.data.length && list.error} onRetry={list.reload} />
        {list.loading ? (
          <SkeletonList />
        ) : list.data.length === 0 ? (
          <Empty icon={<BellOff size={40} />} title="No notifications yet" />
        ) : (
          <div className="space-y-3">
            {list.data.map((n) => (
              <button
                key={n._key}
                onClick={() => show(n)}
                className={`w-full text-left rounded-2xl p-4 border shadow-sm transition ${
                  isSeen(n) ? 'bg-white border-slate-100' : 'bg-brand-50 border-brand-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  {!isSeen(n) && <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800">{n.title}</p>
                    <p className="text-sm text-slate-600 line-clamp-2 mt-0.5">{n.message}</p>
                    {n.time && <p className="text-xs text-slate-400 mt-1">{n.time}</p>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Page>
      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.title}
        footer={
          open && (open.type === 'ad' ? open.link : open.source) ? (
            <>
              <Button variant="outline" onClick={() => setOpen(null)}>Later</Button>
              <Button onClick={() => act(open)}>
                {open.type === 'ad' ? (<><ExternalLink size={16} /> Open link</>) : 'Open'}
              </Button>
            </>
          ) : null
        }
      >
        <ZoomImage src={open?.img} className="mb-3" />
        <p className="text-slate-700 whitespace-pre-line">{open?.message}</p>
        {open?.type === 'ad' && open?.link && <p className="text-sm text-brand-700 mt-3 break-all">{open.link}</p>}
      </Modal>
    </div>
  );
}
