// Public download page: https://easy-pedia.web.app/download
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download as DownloadIcon, Github, Globe, ShieldAlert, Smartphone } from 'lucide-react';
import { APK_URL, APK_URL_GITHUB } from '../config';
import { fetchNativeVersion } from '../lib/nativeVersion';

const STEPS = [
  'Tap “Download APK” and open the file when the download finishes.',
  'If Android asks, allow your browser to “Install unknown apps”.',
  'Tap Install, then open Easy Pedia MCQs and sign in with your usual account.',
];

export default function Download() {
  const [info, setInfo] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchNativeVersion().then(setInfo).catch(() => setFailed(true));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-800 via-brand-600 to-brand-50 pt-safe">
      <div className="max-w-xl mx-auto px-5 pt-12 pb-10">
        <div className="text-center text-white">
          <div className="mx-auto h-24 w-24 rounded-3xl bg-white p-2 shadow-xl">
            <img src="/img/logo.png" alt="" className="h-full w-full" />
          </div>
          <h1 className="font-display text-3xl mt-4">Easy Pedia MCQs</h1>
          <p className="text-white/80 mt-1">Pediatric MCQs made by a pediatrician for pediatricians</p>
        </div>

        <div className="mt-8 bg-white rounded-3xl shadow-xl p-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center">
              <Smartphone size={26} />
            </div>
            <div className="flex-1">
              <p className="font-display text-lg text-slate-900">Android app</p>
              <p className="text-sm text-slate-500">
                {info
                  ? `Version ${info.version}${info.size ? ` · ${info.size}` : ''}${info.date ? ` · ${info.date}` : ''}`
                  : failed
                    ? 'Latest version'
                    : 'Checking latest version…'}
              </p>
            </div>
          </div>

          <a
            href={APK_URL}
            className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-semibold py-4 text-lg shadow-lg shadow-brand-600/30"
          >
            <DownloadIcon size={22} /> Download APK
          </a>
          <a href={APK_URL_GITHUB} className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700">
            <Github size={16} /> Mirror on GitHub
          </a>

          <ol className="mt-6 space-y-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 text-slate-700">
                <span className="h-6 w-6 shrink-0 rounded-full bg-brand-50 text-brand-700 text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-2xl bg-amber-50 text-amber-900 p-4 text-sm flex gap-3">
            <ShieldAlert size={20} className="shrink-0 mt-0.5" />
            <p>
              Have the <b>old</b> Easy Pedia MCQs installed from the Play Store? Uninstall it first — Android
              will not install the new version over it. Your scores are saved in your account, not on the phone.
            </p>
          </div>
          {info && info.signed === false && (
            <p className="mt-3 text-xs text-slate-400 text-center">Test build — you may need to reinstall for the next update.</p>
          )}
        </div>

        <div className="mt-6 bg-white/90 rounded-3xl p-5 flex items-center gap-3">
          <Globe size={22} className="text-brand-700 shrink-0" />
          <p className="text-sm text-slate-700 flex-1">No Android? Use the web app on any phone or computer.</p>
          <Link to="/" className="text-sm font-semibold text-brand-700 whitespace-nowrap">
            Open web app →
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500 flex items-center justify-center gap-1">
          <CheckCircle2 size={14} /> Same account and scores on Android and web
        </p>
      </div>
    </div>
  );
}
