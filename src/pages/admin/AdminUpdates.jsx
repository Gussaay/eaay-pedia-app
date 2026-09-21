// Update manager.
//
// CI publishes every build to `update/history` and points `update/live` at the
// newest one. This screen is the manual control on top of that:
//
//   - pause over-the-air updates when a release turns out to be bad,
//   - roll back by pointing `update/live` at an older build that is still on
//     the server,
//   - mark a release required, so it installs instead of asking,
//   - control the separate "please install the new APK" prompt.
//
// Nothing here rebuilds anything; it only changes what installed apps are
// told to do, and every app picks the change up within a minute.
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  History,
  PauseCircle,
  PlayCircle,
  Smartphone,
  Undo2,
} from 'lucide-react';
import { useAsync, useList } from '../../hooks/useData';
import { getOne, updateAt } from '../../lib/rtdb';
import { countPushTokens } from '../../lib/push';
import { LIVE_UPDATE_URL, NATIVE_VERSION_URL } from '../../config';
import DangerConfirm from '../../components/DangerConfirm';
import {
  AppBar,
  Button,
  Card,
  Empty,
  ErrorBox,
  Input,
  Page,
  SkeletonList,
  Textarea,
  Toggle,
  useToast,
} from '../../components/ui';

const isTrue = (v) => v === true || v === 'true';
const versionKey = (v) => String(v).replace(/\./g, '_');

function StatRow({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-800 text-right">
        {value}
        {hint && <span className="block text-xs font-normal text-slate-400">{hint}</span>}
      </span>
    </div>
  );
}

/** What the phones are actually fetching, straight from the website. */
function PublishedManifest() {
  // Each file is fetched on its own terms. Promise.all would reject the whole
  // panel when only one of them is missing — which is exactly the state before
  // the first deploy that publishes an over-the-air bundle.
  const grab = (url) =>
    fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

  const manifest = useAsync(
    () =>
      Promise.all([grab(LIVE_UPDATE_URL), grab(NATIVE_VERSION_URL)]).then(([live, native]) => ({
        live,
        native,
      })),
    [],
  );

  const live = manifest.data?.live;
  const native = manifest.data?.native;

  return (
    <Card className="p-5">
      <p className="font-display text-lg">Published by the last build</p>
      <p className="text-sm text-slate-500 mt-0.5">Read live from the website, not the database.</p>
      {manifest.loading ? (
        <SkeletonList rows={2} />
      ) : (
        <div className="mt-3 divide-y divide-slate-100">
          <StatRow label="Web bundle (over the air)" value={live?.version || 'not published yet'} />
          <StatRow
            label="Android app (full install)"
            value={native?.version || 'unknown'}
            hint={native?.versionCode ? `build ${native.versionCode}${native.size ? ` · ${native.size}` : ''}` : null}
          />
          <StatRow label="Needs app build at least" value={live?.minNativeBuild || '—'} />
        </div>
      )}
    </Card>
  );
}

export default function AdminUpdates() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [notes, setNotes] = useState(null);

  const config = useAsync(() => getOne('update/live'), []);
  const nativeCfg = useAsync(() => getOne('update/native'), []);
  const reach = useAsync(() => countPushTokens(), []);
  const history = useList('update/history', {
    sort: (a, b) => Number(b.versionCode || 0) - Number(a.versionCode || 0),
  });

  const live = config.data || {};
  const nat = nativeCfg.data || {};
  const paused = isTrue(live.paused);

  const versions = useMemo(() => {
    const entries = Object.entries(reach.data?.byVersion || {});
    const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
    return entries
      .sort((a, b) => b[1] - a[1])
      .map(([version, count]) => ({ version, count, percent: Math.round((count / total) * 100) }));
  }, [reach.data]);

  const save = async (path, values, message) => {
    setBusy(true);
    try {
      await updateAt(path, values);
      toast(message, 'success');
      config.reload();
      nativeCfg.reload();
    } catch (e) {
      toast(e.message || 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };

  const promote = (release) =>
    save(
      'update/live',
      {
        version: release.version,
        url: release.url,
        checksum: release.checksum || null,
        minNativeBuild: release.minNativeBuild || 0,
        notes: release.notes || null,
        paused: false,
      },
      `Version ${release.version} is now the live update.`,
    );

  return (
    <div className="min-h-screen">
      <AppBar title="Update manager" subtitle="Control what installed apps update to" />
      <Page className="space-y-4">
        <ErrorBox error={config.error} onRetry={config.reload} />

        {/* --- Live over-the-air release --- */}
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div
              className={`h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center ${
                paused ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              {paused ? <PauseCircle size={22} /> : <ArrowUpCircle size={22} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg">Over-the-air updates</p>
              <p className="text-sm text-slate-500 mt-0.5">
                {paused
                  ? 'Paused. Apps stay on the version they already have.'
                  : live.version
                    ? `Apps are updating to ${live.version}.`
                    : 'Apps follow whatever the last build published.'}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <Toggle
              label="Pause over-the-air updates"
              checked={paused}
              onChange={(v) =>
                save('update/live', { paused: v }, v ? 'Updates paused.' : 'Updates resumed.')
              }
            />
            <Toggle
              label="Required — install without asking"
              checked={isTrue(live.mandatory)}
              onChange={(v) =>
                save(
                  'update/live',
                  { mandatory: v },
                  v ? 'This update is now required.' : 'This update is now optional.',
                )
              }
            />
          </div>

          <div className="mt-4">
            <Textarea
              label="What's new (shown in the update dialog)"
              rows={2}
              value={notes ?? live.notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Leave empty to use the commit message from the build"
            />
            {notes !== null && notes !== (live.notes || '') && (
              <Button
                className="mt-2"
                loading={busy}
                onClick={() => save('update/live', { notes }, 'Release notes saved.').then(() => setNotes(null))}
              >
                Save notes
              </Button>
            )}
          </div>

          {paused && (
            <p className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              While this is on, no app updates itself — including from a new build. Remember to turn
              it back off.
            </p>
          )}
        </Card>

        {/* --- Full APK prompt --- */}
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center">
              <Smartphone size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg">"Install the new app" prompt</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Shown only when the Android app itself changed, so a full install is unavoidable.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <Toggle
              label="Required — users cannot dismiss it"
              checked={isTrue(nat.mandatory)}
              onChange={(v) => save('update/native', { mandatory: v }, 'Saved.')}
            />
            <Toggle
              label="Hide the prompt entirely"
              checked={isTrue(nat.hidden)}
              onChange={(v) => save('update/native', { hidden: v }, 'Saved.')}
            />
            <Input
              label="Custom message (optional)"
              defaultValue={nat.message || ''}
              placeholder="Uses the release notes when empty"
              onBlur={(e) => {
                if (e.target.value !== (nat.message || '')) save('update/native', { message: e.target.value }, 'Message saved.');
              }}
            />
          </div>
        </Card>

        {/* --- Adoption --- */}
        <Card className="p-5">
          <p className="font-display text-lg">Who is on what</p>
          <p className="text-sm text-slate-500 mt-0.5">
            From devices registered for notifications — {reach.data?.devices || 0} device
            {reach.data?.devices === 1 ? '' : 's'}, {reach.data?.users || 0} user
            {reach.data?.users === 1 ? '' : 's'}.
          </p>
          <div className="mt-3 space-y-2">
            {reach.loading ? (
              <SkeletonList rows={2} />
            ) : versions.length === 0 ? (
              <Empty title="No devices registered yet" />
            ) : (
              versions.map((v) => (
                <div key={v.version}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">{v.version}</span>
                    <span className="text-slate-500">
                      {v.count} · {v.percent}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-brand-500" style={{ width: `${v.percent}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <PublishedManifest />

        {/* --- History / rollback --- */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <History size={18} className="text-slate-400" />
            <p className="font-display text-lg">Release history</p>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Roll back by making an earlier build live again. Its files are still on the server.
          </p>

          <div className="mt-4 space-y-3">
            {history.loading ? (
              <SkeletonList rows={3} />
            ) : history.data.length === 0 ? (
              <Empty title="No builds recorded yet" >
                The next deploy will start filling this in.
              </Empty>
            ) : (
              history.data.map((r) => {
                const isLive = versionKey(live.version || '') === versionKey(r.version || '');
                return (
                  <div
                    key={r._key}
                    className={`rounded-2xl border p-4 ${
                      isLive ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-100 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800">
                          {r.version}
                          {isLive && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              <CheckCircle2 size={12} /> live
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          build {r.versionCode}
                          {r.date ? ` · ${r.date}` : ''}
                          {r.size ? ` · APK ${r.size}` : ''}
                        </p>
                        {r.notes && <p className="text-sm text-slate-600 mt-1.5 line-clamp-2">{r.notes}</p>}
                      </div>
                      {!isLive && (
                        <Button
                          variant="outline"
                          className="!py-1.5 shrink-0"
                          disabled={busy || !r.url}
                          onClick={() => setConfirm(r)}
                        >
                          <Undo2 size={16} /> Make live
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </Page>

      <DangerConfirm
        open={!!confirm}
        title={`Make ${confirm?.version} the live update?`}
        message={`Every app that checks for updates from now on will move to ${confirm?.version}.`}
        impact={[
          'Apps already on a newer version will be moved back to this one.',
          'This does not uninstall anything and scores are untouched.',
        ]}
        keeps={[
          confirm?.minNativeBuild
            ? `Only apps built ${confirm.minNativeBuild} or later can take it; older ones stay put.`
            : 'Apps too old to run this bundle will stay where they are.',
        ]}
        confirmWord="LIVE"
        confirmLabel="Make live"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await promote(confirm);
          setConfirm(null);
        }}
      />

      {paused ? null : (
        <button
          type="button"
          onClick={() => save('update/live', { paused: true }, 'Updates paused.')}
          className="fixed bottom-6 right-5 z-30 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg"
        >
          <PauseCircle size={18} /> Stop rollout
        </button>
      )}
      {paused && (
        <button
          type="button"
          onClick={() => save('update/live', { paused: false }, 'Updates resumed.')}
          className="fixed bottom-6 right-5 z-30 flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg"
        >
          <PlayCircle size={18} /> Resume rollout
        </button>
      )}
    </div>
  );
}
