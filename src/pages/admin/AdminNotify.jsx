// Notification manager: write an announcement, choose who gets it, and send
// it as a push notification that arrives while the app is closed.
//
// Sending writes two records in one go:
//
//   all_notification/<key>   the message itself. Both this app and the old
//                            Android app already read this node, so it shows
//                            up in everyone's Notifications list either way.
//   push_outbox/<key>        a request to push it to phones. A GitHub Actions
//                            job holds the Firebase service account and does
//                            the actual sending, because pushing needs server
//                            credentials that must never sit inside an app.
//
// The split matters: the announcement is saved even if push delivery is
// delayed or fails, so nothing is ever lost.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BellRing,
  CheckCircle2,
  Clock,
  ExternalLink,
  MousePointerClick,
  Send,
  Smartphone,
  Trash2,
  Users,
} from 'lucide-react';
import { useAsync, useList } from '../../hooks/useData';
import { getLatest, getOne, newKey, num, removeAt, updatePaths } from '../../lib/rtdb';
import { countPushTokens } from '../../lib/push';
import ImageField from '../../components/ImageField';
import DangerConfirm from '../../components/DangerConfirm';
import {
  AppBar,
  Button,
  Card,
  Empty,
  ErrorBox,
  Input,
  Modal,
  Page,
  Select,
  SkeletonList,
  Textarea,
  Toggle,
  useToast,
} from '../../components/ui';

const hasContent = (n) => !!(n && (n.title || n.message));

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const BLANK = {
  title: '',
  message: '',
  img: '',
  type: 'news',
  link: '',
  source: '',
  target: 'all',
  level: '',
  uid: '',
  push: true,
};

export default function AdminNotify() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ ...BLANK, ...(params.get('to') ? { target: 'user', uid: params.get('to') } : {}) });
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [open, setOpen] = useState(null);

  const reach = useAsync(() => countPushTokens(), []);
  // The levels come from the accounts themselves, not from the LEVELS list in
  // config.js. Those two do not agree — the records hold "pediatric resident"
  // where the constant says "pediatric Resident" — and the sender matches the
  // stored value exactly, so picking from a tidied-up list would send to
  // nobody without saying so.
  const accounts = useList('quizusers');
  const history = useAsync(
    () => getLatest('all_notification', 40).then((l) => l.filter(hasContent)),
    [],
  );
  const outbox = useAsync(() => getOne('push_outbox'), []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const levels = useMemo(() => {
    const counts = {};
    accounts.data.forEach((u) => {
      if (u.level) counts[u.level] = (counts[u.level] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [accounts.data]);

  const audience = useMemo(() => {
    if (form.target === 'user') return 'one person';
    if (form.target === 'level') {
      const count = levels.find(([l]) => l === form.level)?.[1];
      return form.level ? `${form.level} — ${count || 0} account${count === 1 ? '' : 's'}` : 'a level';
    }
    return `everyone — about ${reach.data?.devices || 0} device${reach.data?.devices === 1 ? '' : 's'}`;
  }, [form.target, form.level, reach.data, levels]);

  const send = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast('A title and a message are both needed', 'error');
      return;
    }
    if (form.target === 'level' && !form.level) {
      toast('Choose which level to send to', 'error');
      return;
    }
    if (form.target === 'user' && !form.uid.trim()) {
      toast('Choose who to send to', 'error');
      return;
    }

    setSending(true);
    const key = newKey('all_notification');
    // Sketchware wrote every value as a string and the Android app still parses
    // these as strings, so the counters start at "0", not 0.
    const notification = {
      key,
      title: form.title.trim(),
      message: form.message.trim(),
      img: form.img || '',
      type: form.type,
      link: form.type === 'ad' ? form.link.trim() : '',
      source: form.type === 'news' ? form.source.trim() : '',
      time: stamp(),
      read: '0',
      click: '0',
    };

    const updates = { [`all_notification/${key}`]: notification };

    if (form.push) {
      updates[`push_outbox/${key}`] = {
        title: notification.title,
        body: notification.message,
        // Deep link for a tap. The app routes /notifications, or straight to a
        // category when the announcement points at one.
        url: form.type === 'news' && form.source ? `/cat/${encodeURIComponent(form.source)}` : '/notifications',
        target: form.target,
        level: form.target === 'level' ? form.level : '',
        uid: form.target === 'user' ? form.uid.trim() : '',
        notificationKey: key,
        status: 'pending',
        createdAt: Date.now(),
      };
    }

    try {
      // One atomic write: the announcement and its push request never disagree.
      await updatePaths(updates);
      toast(form.push ? 'Saved and queued for sending.' : 'Announcement saved.', 'success');
      setForm({ ...BLANK });
      history.reload();
      outbox.reload();
    } catch (e) {
      toast(e.message || 'Could not send', 'error');
    } finally {
      setSending(false);
    }
  };

  const deliveryOf = (key) => outbox.data?.[key] || null;

  return (
    <div className="min-h-screen">
      <AppBar title="Notification manager" subtitle="Announcements and push notifications" />
      <Page className="space-y-4">
        <ErrorBox error={history.error} onRetry={history.reload} />

        {/* --- Compose --- */}
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center">
              <BellRing size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg">New announcement</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Goes to the Notifications list in the app{form.push ? ', and to phones as a push notification' : ''}.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Input label="Title" value={form.title} onChange={set('title')} placeholder="New MCQs added" />
            <Textarea
              label="Message"
              rows={3}
              value={form.message}
              onChange={set('message')}
              placeholder="120 new cardiology questions are now available."
            />
            <ImageField label="Image (optional)" folder="notification" value={form.img} onChange={set('img')} />

            <Select label="What happens when it is opened" value={form.type} onChange={set('type')}>
              <option value="news">Open a category in the app</option>
              <option value="ad">Open a web link</option>
            </Select>

            {form.type === 'news' ? (
              <Input
                label="Category name (optional)"
                value={form.source}
                onChange={set('source')}
                placeholder="Exactly as it appears in the catalogue, e.g. nelson"
                hint="Leave empty for an announcement with nothing to open."
              />
            ) : (
              <Input
                label="Link"
                value={form.link}
                onChange={set('link')}
                placeholder="https://..."
              />
            )}

            <Select label="Send to" value={form.target} onChange={set('target')}>
              <option value="all">Everyone</option>
              <option value="level">One education level</option>
              <option value="user">One person</option>
            </Select>

            {form.target === 'level' && (
              <Select label="Level" value={form.level} onChange={set('level')}>
                <option value="">Choose a level</option>
                {levels.map(([l, count]) => (
                  <option key={l} value={l}>
                    {l} ({count})
                  </option>
                ))}
              </Select>
            )}
            {form.target === 'user' && (
              <Input
                label="User ID"
                value={form.uid}
                onChange={set('uid')}
                placeholder="Pick a person from the User manager"
                hint="The User manager fills this in for you."
              />
            )}

            <div className="mt-2">
              <Toggle
                label="Also send as a push notification"
                checked={form.push}
                onChange={(v) => setForm((f) => ({ ...f, push: v }))}
              />
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              <Users size={16} className="shrink-0 text-slate-400" />
              <span>Going to {audience}.</span>
            </div>

            <Button className="mt-4 w-full justify-center" onClick={send} loading={sending}>
              <Send size={18} /> {form.push ? 'Save and send' : 'Save announcement'}
            </Button>

            {form.push && (
              <p className="mt-2 text-xs text-slate-400">
                The announcement appears in the app immediately. Push delivery runs on the server and
                usually lands within a few minutes.
              </p>
            )}
          </div>
        </Card>

        {/* --- Reach --- */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Smartphone size={18} className="text-slate-400" />
            <p className="font-display text-lg">Who can be reached</p>
          </div>
          {reach.loading ? (
            <SkeletonList rows={1} />
          ) : (
            <p className="text-sm text-slate-500 mt-1">
              {reach.data?.devices || 0} device{reach.data?.devices === 1 ? '' : 's'} across{' '}
              {reach.data?.users || 0} account{reach.data?.users === 1 ? '' : 's'} have notifications
              turned on. Everyone else still sees announcements inside the app.
            </p>
          )}
        </Card>

        {/* --- History --- */}
        <Card className="p-5">
          <p className="font-display text-lg">Sent announcements</p>
          <p className="text-sm text-slate-500 mt-0.5">Newest first, with how many people opened them.</p>

          <div className="mt-4 space-y-3">
            {history.loading ? (
              <SkeletonList rows={3} />
            ) : (history.data || []).length === 0 ? (
              <Empty icon={<BellRing size={32} />} title="Nothing sent yet" />
            ) : (
              history.data.map((n) => {
                const delivery = deliveryOf(n.key || n._key);
                return (
                  <div key={n._key} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 truncate">{n.title}</p>
                        <p className="text-sm text-slate-600 line-clamp-2 mt-0.5">{n.message}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          {n.time && <span>{n.time}</span>}
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 size={12} /> {num(n.read)} opened
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MousePointerClick size={12} /> {num(n.click)} tapped through
                          </span>
                          {delivery && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                                delivery.status === 'sent'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : delivery.status === 'failed'
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {delivery.status === 'sent' ? (
                                <>
                                  <Send size={11} /> pushed to {delivery.sentCount ?? '?'}
                                </>
                              ) : delivery.status === 'failed' ? (
                                <>failed</>
                              ) : (
                                <>
                                  <Clock size={11} /> waiting to send
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => setOpen(n)}
                          className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Preview"
                          title="Preview"
                        >
                          <ExternalLink size={18} />
                        </button>
                        <button
                          onClick={() => setConfirm(n)}
                          className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </Page>

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.title}
        footer={
          <Button variant="outline" onClick={() => setOpen(null)}>
            Close
          </Button>
        }
      >
        {open?.img && <img src={open.img} alt="" className="rounded-xl mb-3 w-full object-cover max-h-52" />}
        <p className="text-slate-700 whitespace-pre-line">{open?.message}</p>
        {open?.link && <p className="text-sm text-brand-700 mt-3 break-all">{open.link}</p>}
        {open?.source && <p className="text-sm text-slate-500 mt-3">Opens the “{open.source}” category.</p>}
      </Modal>

      <DangerConfirm
        open={!!confirm}
        title="Delete this announcement?"
        message={confirm?.title}
        impact={['It disappears from everyone’s Notifications list, on Android and on the web.']}
        keeps={[
          'A push notification that already reached a phone stays in its notification tray.',
          'The counts of who opened it are deleted with it.',
        ]}
        confirmWord="DELETE"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            await removeAt(`all_notification/${confirm.key || confirm._key}`);
            toast('Announcement deleted.', 'success');
            history.reload();
          } catch (e) {
            toast(e.message || 'Could not delete', 'error');
          } finally {
            setConfirm(null);
          }
        }}
      />
    </div>
  );
}
