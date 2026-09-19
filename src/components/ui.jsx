import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ImageOff, Loader2, WifiOff, X } from 'lucide-react';
import { useOnline } from '../hooks/useData';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export function AppBar({ title, subtitle, back = true, onBack, actions, left }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 bg-brand-700 text-white shadow-md pt-safe">
      <div className="flex items-center gap-2 h-14 px-2 max-w-3xl mx-auto">
        {left}
        {back && !left && (
          <button
            aria-label="Back"
            className="p-2 rounded-full hover:bg-white/10 active:bg-white/20"
            onClick={onBack || (() => navigate(-1))}
          >
            <ArrowLeft size={22} />
          </button>
        )}
        <div className="flex-1 min-w-0 px-1">
          <h1 className="font-display text-lg leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-white/80 truncate">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </header>
  );
}

export function Page({ children, className = '' }) {
  return <main className={`max-w-3xl mx-auto w-full px-4 py-4 pb-safe ${className}`}>{children}</main>;
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="bg-amber-100 text-amber-900 text-sm px-4 py-2 flex items-center gap-2 justify-center">
      <WifiOff size={16} /> You are offline — showing saved data.
    </div>
  );
}

export const Card = ({ children, className = '', ...rest }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${className}`} {...rest}>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-brand-50 text-brand-800 hover:bg-brand-100',
  outline: 'border border-slate-300 text-slate-700 bg-white hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  ghost: 'text-brand-700 hover:bg-brand-50',
};

export function Button({ variant = 'primary', className = '', loading, children, disabled, ...rest }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block mb-3">
      {label && <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>}
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400';

export const Input = ({ label, hint, className = '', ...rest }) => (
  <Field label={label} hint={hint}>
    <input className={`${inputCls} ${className}`} {...rest} />
  </Field>
);

export const Textarea = ({ label, hint, className = '', rows = 3, ...rest }) => (
  <Field label={label} hint={hint}>
    <textarea rows={rows} className={`${inputCls} ${className}`} {...rest} />
  </Field>
);

export const Select = ({ label, hint, children, className = '', ...rest }) => (
  <Field label={label} hint={hint}>
    <select className={`${inputCls} ${className}`} {...rest}>
      {children}
    </select>
  </Field>
);

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 py-2 cursor-pointer select-none">
      <input
        type="checkbox"
        className="h-5 w-5 rounded accent-brand-600"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-slate-800">{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------
export const Spinner = ({ label }) => (
  <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
    <Loader2 className="animate-spin text-brand-600" size={36} />
    {label && <p className="text-sm">{label}</p>}
  </div>
);

export function SkeletonList({ rows = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 bg-white rounded-2xl p-3 border border-slate-100">
          <div className="h-14 w-14 rounded-xl bg-slate-200 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 bg-slate-200 rounded animate-pulse" />
            <div className="h-3 w-1/3 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export const Empty = ({ icon, title, children }) => (
  <div className="text-center py-14 px-6 text-slate-500">
    {icon && <div className="flex justify-center mb-3 text-slate-300">{icon}</div>}
    <p className="font-semibold text-slate-700">{title}</p>
    {children && <div className="text-sm mt-1">{children}</div>}
  </div>
);

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <Card className="p-4 border-red-200 bg-red-50 text-red-800 text-sm">
      <p className="font-semibold">Could not load data</p>
      <p className="mt-1 break-words">{error.message || String(error)}</p>
      {onRetry && (
        <Button variant="outline" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------
// Colourful placeholder covers (Storage images are often missing): the same
// title always gets the same gradient.
const TILE_GRADIENTS = [
  'from-sky-500 to-blue-700',
  'from-emerald-500 to-teal-700',
  'from-violet-500 to-indigo-700',
  'from-rose-500 to-pink-700',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-700',
  'from-fuchsia-500 to-purple-700',
  'from-lime-500 to-green-700',
];
const radius = (cls) => (/rounded-/.test(cls) ? '' : 'rounded-xl');
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export function initials(label = '') {
  const words = String(label)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(mcqs?|review|the|of|and|exams?)$/i.test(w));
  if (!words.length) return 'EP';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + (/\d/.test(words[1]) ? words[1].slice(0, 2) : words[1][0])).toUpperCase();
}

export function CoverTile({ label, className = 'h-14 w-14', style }) {
  const gradient = TILE_GRADIENTS[hash(label) % TILE_GRADIENTS.length];
  return (
    <div
      style={style}
      className={`${className} ${radius(className)} shrink-0 bg-gradient-to-br ${gradient} text-white flex items-center justify-center font-display tracking-wide shadow-inner relative overflow-hidden`}
      aria-hidden="true"
    >
      <span className="absolute -right-3 -bottom-3 h-10 w-10 rounded-full bg-white/15" />
      <span className="absolute -left-2 -top-2 h-6 w-6 rounded-full bg-white/10" />
      <span className="relative text-[1.05em]">{initials(label)}</span>
    </div>
  );
}

export function Thumb({ src, alt = '', label, className = 'h-14 w-14', fallback, style }) {
  const [failed, setFailed] = useState(false);
  if ((!src || failed) && !fallback) return <CoverTile label={label || alt} className={className} style={style} />;
  const url = !src || failed ? fallback : src;
  return (
    <img
      src={url}
      alt={alt}
      style={style}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${className} ${radius(className)} object-cover bg-slate-100 shrink-0`}
    />
  );
}

export function Avatar({ src, size = 48, className = '' }) {
  return (
    <Thumb
      src={src}
      fallback="/img/child.png"
      className={`rounded-full ${className}`}
      alt="avatar"
      style={{ width: size, height: size }}
    />
  );
}

/** Tappable image that opens full screen with pinch-zoom (PhotoView replacement). */
export function ZoomImage({ src, className = '' }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  if (!src) return null;
  if (broken)
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
        <ImageOff size={16} /> Image unavailable
      </div>
    );
  return (
    <>
      <img
        src={src}
        alt=""
        onError={() => setBroken(true)}
        onClick={() => setOpen(true)}
        className={`rounded-xl max-h-72 w-auto mx-auto cursor-zoom-in ${className}`}
      />
      {open && (
        <div className="fixed inset-0 z-[70] bg-black/95 flex flex-col" onClick={() => setOpen(false)}>
          <button className="self-end p-4 text-white" aria-label="Close">
            <X size={28} />
          </button>
          <div className="flex-1 overflow-auto touch-pinch-zoom flex items-center justify-center p-2">
            <img src={src} alt="" className="max-w-none w-full h-auto" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------
export function ListCard({ img, title, subtitle, right, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 bg-white rounded-2xl p-3 border border-slate-100 shadow-sm hover:shadow-md active:scale-[0.98] transition"
    >
      <Thumb src={img} label={title} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 leading-snug line-clamp-2">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{subtitle}</p>}
      </div>
      {badge}
      {right ?? <ChevronRight className="text-slate-300 shrink-0" size={20} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, dismissable = true, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
      onClick={dismissable ? onClose : undefined}
    >
      <div
        className={`bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-xl pb-safe`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || dismissable) && (
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="font-display text-lg text-slate-900">{title}</h2>
            {dismissable && (
              <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={22} />
              </button>
            )}
          </div>
        )}
        <div className="px-5 pb-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 flex gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ open, title = 'Are you sure?', message, confirmText = 'Yes', cancelText = 'No', onConfirm, onCancel, danger }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-slate-600 whitespace-pre-line">{message}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Toasts (SketchwareUtil.showMessage replacement)
// ---------------------------------------------------------------------------
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed bottom-6 inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none pb-safe">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-full px-4 py-2 text-sm shadow-lg text-white ${
              t.type === 'error' ? 'bg-red-600' : t.type === 'success' ? 'bg-emerald-600' : 'bg-slate-800'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
