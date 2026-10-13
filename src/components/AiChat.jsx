// Pieces of the AI study helper shared by the AI Study page and the quiz
// explanation: a safe renderer for a reply, and a small tutor chat.
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Cpu, RotateCcw, Send, Sparkles } from 'lucide-react';
import { askAi } from '../lib/ai';
import { getTutorChat, saveTutorChat } from '../lib/aiCache';
import { parseReply } from '../lib/aiFormat';
import { Button, Modal } from './ui';

/** Renders Gemini's light markdown as React nodes (never innerHTML). */
export function AiReply({ text, className = '' }) {
  return (
    <div className={`text-slate-700 leading-relaxed space-y-1.5 ${className}`}>
      {parseReply(text).map((b, i) => {
        const body = b.parts.map((p, j) => (p.bold ? <b key={j} className="text-slate-900">{p.text}</b> : <span key={j}>{p.text}</span>));
        if (b.type === 'hr') return <hr key={i} className="border-slate-200 !my-3" />;
        if (b.type === 'h') return <p key={i} className="font-semibold text-slate-900 pt-1">{body}</p>;
        if (b.type === 'li') return <p key={i} className="pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-brand-500">{body}</p>;
        return <p key={i}>{body}</p>;
      })}
    </div>
  );
}

/** Which Gemini model wrote a reply, e.g. "gemini-2.5-flash". */
export function ModelTag({ model, className = '' }) {
  if (!model) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] text-slate-400 ${className}`}>
      <Cpu size={12} /> {model}
    </span>
  );
}

const WAIT_HINTS = [
  [0, 'Sending to Gemini…'],
  [4, 'Gemini is writing the answer…'],
  [15, 'Still writing — longer answers take a little while…'],
  [30, 'Gemini is busy, retrying — this can take up to a minute…'],
];

/**
 * Shown while a reply is on its way. Gemini sends the whole answer at once,
 * often after 10–30 s, so a moving bar, a timer and what is happening keep it
 * from looking frozen.
 */
export function AiWaiting({ label, onCancel, className = '' }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setSecs(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const hint = WAIT_HINTS.filter(([from]) => secs >= from).pop()[1];
  return (
    <div className={`rounded-2xl bg-violet-50/60 border border-violet-100 px-3 py-3 ${className}`} role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-violet-800">
        <Sparkles size={16} className="animate-pulse text-violet-500 shrink-0" />
        <span className="flex-1">{label || hint}</span>
        <span className="tabular-nums text-xs text-violet-400">{secs}s</span>
      </div>
      {label && <p className="text-xs text-slate-500 mt-1 pl-6">{hint}</p>}
      <div className="mt-2.5 h-1 rounded-full bg-violet-100 overflow-hidden">
        <div className="h-full w-2/5 rounded-full bg-violet-400 animate-slide" />
      </div>
      <div className="mt-3 space-y-2 animate-pulse" aria-hidden>
        <div className="h-2.5 rounded bg-violet-100 w-11/12" />
        <div className="h-2.5 rounded bg-violet-100 w-4/5" />
        <div className="h-2.5 rounded bg-violet-100 w-2/3" />
      </div>
      {onCancel && (
        <button onClick={onCancel} className="mt-3 text-xs font-medium text-slate-500 hover:text-slate-700">
          Cancel
        </button>
      )}
    </div>
  );
}

/** A reply still being written: the text so far, with a stop button. */
function StreamingReply({ text, onCancel }) {
  return (
    <div className="mr-4 rounded-2xl rounded-bl-md bg-slate-50 border border-slate-100 px-3 py-2">
      <AiReply text={text} />
      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-violet-500">
        <Sparkles size={12} className="animate-pulse" /> Writing…
        {onCancel && (
          <button onClick={onCancel} className="ml-auto font-medium text-slate-500 hover:text-slate-700">
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A tutor conversation. `context` (a question, card or topic) is sent with
 * every turn so follow-ups stay about the thing being studied; `seed` starts
 * the chat with an earlier reply, e.g. the AI explanation of a question;
 * `ask` sends a first question as soon as the chat opens.
 */
export default function AiChat({ context, seed = [], ask, onChange, placeholder = 'Ask anything about pediatrics…', className = '' }) {
  const [messages, setMessages] = useState(seed);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const request = useRef(0); // bumped on send and cancel; a stale reply is dropped
  const abort = useRef(null);
  const [partial, setPartial] = useState(''); // the reply so far, while it streams

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, busy, partial]);

  const send = async (asked) => {
    const q = (typeof asked === 'string' ? asked : text).trim();
    if (!q || busy) return;
    const next = [...messages, { role: 'user', text: q }];
    setMessages(next);
    setText('');
    setError('');
    setBusy(true);
    setPartial('');
    const id = ++request.current;
    abort.current = new AbortController();
    try {
      const res = await askAi(
        { task: 'chat', messages: next, context },
        { signal: abort.current.signal, onText: (t) => id === request.current && setPartial((p) => p + t) },
      );
      if (id !== request.current) return;
      const done = [...next, { role: 'model', text: res.text, model: res.model }];
      setMessages(done);
      onChange?.(done);
    } catch (e) {
      if (id !== request.current) return;
      setError(e.message);
      setMessages(next.slice(0, -1));
      setText(q);
    } finally {
      if (id === request.current) {
        setBusy(false);
        setPartial('');
      }
    }
  };

  const cancel = () => {
    request.current++;
    abort.current?.abort();
    setBusy(false);
    setPartial('');
    const last = messages[messages.length - 1];
    if (last?.role === 'user') {
      setMessages(messages.slice(0, -1));
      setText((t) => t || last.text);
    }
  };

  const asked = useRef(false);
  useEffect(() => {
    if (ask && !asked.current) {
      asked.current = true;
      send(ask);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the keyboard has opened, bring the box back into view above it.
  const revealInput = () => setTimeout(() => inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 350);

  return (
    <div className={className}>
      <div className="space-y-3">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ml-8 rounded-2xl rounded-br-md bg-brand-600 text-white px-3 py-2 whitespace-pre-line">
              {m.text}
            </div>
          ) : (
            <div key={i} className="mr-4 rounded-2xl rounded-bl-md bg-slate-50 border border-slate-100 px-3 py-2">
              <AiReply text={m.text} />
              <ModelTag model={m.model} className="mt-1.5" />
            </div>
          ),
        )}
        {busy && partial && <StreamingReply text={partial} onCancel={cancel} />}
        {busy && !partial && <AiWaiting className="mr-4" onCancel={cancel} />}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 mt-3 items-end">
        <textarea
          ref={inputRef}
          rows={1}
          onFocus={revealInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none max-h-32"
        />
        <Button onClick={send} disabled={!text.trim()} loading={busy} aria-label="Send">
          {!busy && <Send size={18} />}
        </Button>
      </div>
    </div>
  );
}

/**
 * "Explain with AI" for one MCQ. The explanation and any follow-up questions
 * open in a pop-up and are kept on the device per question, so reopening it —
 * now or after leaving the quiz — shows them again without a new request.
 */
export function AiExplain({ question }) {
  const [messages, setMessages] = useState(() => getTutorChat(question));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [round, setRound] = useState(0); // remounts the chat after "New explanation" or a direct question
  const [ask, setAsk] = useState(''); // a point typed under the button, sent as the chat opens
  const [point, setPoint] = useState('');
  const [partial, setPartial] = useState('');
  const request = useRef(0);
  const abort = useRef(null);

  useEffect(() => {
    request.current++;
    abort.current?.abort();
    setPartial('');
    setMessages(getTutorChat(question));
    setOpen(false);
    setBusy(false);
    setError('');
    setAsk('');
    setPoint('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question._key]);

  const fetchExplanation = async () => {
    const id = ++request.current;
    abort.current = new AbortController();
    setBusy(true);
    setPartial('');
    setError('');
    try {
      const { _key, ...q } = question;
      const res = await askAi(
        { task: 'explain', question: q },
        { signal: abort.current.signal, onText: (t) => id === request.current && setPartial((p) => p + t) },
      );
      if (id !== request.current) return;
      const first = [{ role: 'model', text: res.text, model: res.model }];
      setMessages(first);
      setAsk('');
      setRound((r) => r + 1);
      saveTutorChat(question, first);
    } catch (e) {
      if (id === request.current) setError(e.message);
    } finally {
      if (id === request.current) {
        setBusy(false);
        setPartial('');
      }
    }
  };

  const explain = () => {
    setOpen(true);
    if (!messages && !busy) fetchExplanation();
  };

  // Straight to the tutor with one point, without waiting for a full explanation.
  const clarify = () => {
    const q = point.trim();
    if (!q) return;
    request.current++; // a full explanation still loading is dropped
    abort.current?.abort();
    setBusy(false);
    setPartial('');
    setError('');
    setAsk(q);
    setPoint('');
    setRound((r) => r + 1);
    setOpen(true);
  };

  const cancel = () => {
    request.current++;
    abort.current?.abort();
    setBusy(false);
    setPartial('');
    setOpen(false);
  };

  const regenerate = () => {
    saveTutorChat(question, null);
    setMessages(null);
    fetchExplanation();
  };

  const { _key, ...plain } = question;
  return (
    <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-3">
      <Button variant="ghost" className="!px-0 !text-violet-700 w-full !justify-between" onClick={explain}>
        <span className="flex items-center gap-2">
          <Sparkles size={18} /> {messages ? 'Open AI explanation' : busy ? 'Explaining…' : 'Explain with AI'}
        </span>
        <ChevronRight size={18} />
      </Button>
      <form
        className="flex gap-2 mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          clarify();
        }}
      >
        <input
          value={point}
          onChange={(e) => setPoint(e.target.value)}
          placeholder="Or ask about a specific point…"
          enterKeyHint="send"
          className="flex-1 min-w-0 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
        />
        <Button type="submit" disabled={!point.trim()} className="!px-3 !bg-violet-600" aria-label="Ask the AI tutor">
          <Send size={16} />
        </Button>
      </form>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title={
          <span className="flex items-center gap-2 text-violet-800">
            <Sparkles size={18} /> AI tutor
          </span>
        }
      >
        {busy && partial && <StreamingReply text={partial} onCancel={cancel} />}
        {busy && !partial && <AiWaiting className="my-2" label="Explaining this question…" onCancel={cancel} />}
        {error && (
          <div className="py-4">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" className="mt-3" onClick={fetchExplanation}>
              Try again
            </Button>
          </div>
        )}
        {(messages || ask) && !busy && (
          <>
            <AiChat
              key={`${_key}-${round}`}
              context={{ kind: 'question', question: plain }}
              seed={messages || []}
              ask={ask}
              onChange={(m) => {
                setAsk('');
                setMessages(m);
                saveTutorChat(question, m);
              }}
              placeholder="Ask a follow-up…"
            />
            <div className="flex items-center justify-between gap-3 mt-2">
              <p className="text-[11px] text-slate-400">AI can be wrong — check important facts against your references.</p>
              <button onClick={regenerate} className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-800">
                <RotateCcw size={12} /> New explanation
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
