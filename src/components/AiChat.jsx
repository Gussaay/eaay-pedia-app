// Pieces of the AI study helper shared by the AI Study page and the quiz
// explanation: a safe renderer for a reply, and a small tutor chat.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, ChevronRight, Cpu, GitCompare, ListChecks, Play, RotateCcw, Send, Sparkles } from 'lucide-react';
import { askAi, useAiQuota } from '../lib/ai';
import { subscribe } from '../lib/rtdb';
import { getTutorChat, saveTutorChat } from '../lib/aiCache';
import { parseReply } from '../lib/aiFormat';
import { quizPath } from '../lib/quizSource';
import { Button, Modal } from './ui';

// Inline text, with textbook citations like [2] shown as small tags.
function Inline({ parts }) {
  return parts.map((p, j) => {
    const bits = p.text.split(/(\[\d{1,2}(?:\s*[,\u2013-]\s*\d{1,2})*\])/g).map((t, k) =>
      k % 2 === 1 ? (
        <sup key={k} className="ml-0.5 rounded bg-emerald-50 px-1 text-[10px] font-semibold text-emerald-700">
          {t.slice(1, -1)}
        </sup>
      ) : (
        t
      ),
    );
    if (p.bold) return <b key={j} className="text-slate-900">{bits}</b>;
    if (p.italic) return <i key={j}>{bits}</i>;
    return <span key={j}>{bits}</span>;
  });
}

/** Renders the models' light markdown as React nodes (never innerHTML). */
export function AiReply({ text, className = '' }) {
  return (
    <div className={`text-slate-700 leading-relaxed space-y-1.5 ${className}`}>
      {parseReply(text).map((b, i) => {
        const body = <Inline parts={b.parts} />;
        if (b.type === 'hr') return <hr key={i} className="border-slate-200 !my-3" />;
        if (b.type === 'h') return <p key={i} className="font-semibold text-slate-900 pt-1">{body}</p>;
        if (b.type === 'li' && b.num) {
          return (
            <p key={i} className="pl-6 relative">
              <span className="absolute left-0 min-w-[1.25rem] text-right font-semibold text-brand-600 tabular-nums">{b.num}.</span>
              {body}
            </p>
          );
        }
        if (b.type === 'li') return <p key={i} className="pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-brand-500">{body}</p>;
        if (b.type === 'table') {
          const [head, ...rows] = b.rows;
          return (
            <div key={i} className="overflow-x-auto -mx-1 !my-2">
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr>
                    {head.map((c, k) => (
                      <th key={k} className="text-left font-semibold text-slate-900 bg-slate-100 border border-slate-200 px-2 py-1 align-top">
                        <Inline parts={c} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, n) => (
                    <tr key={n} className={n % 2 ? 'bg-slate-50/60' : ''}>
                      {head.map((_, k) => (
                        <td key={k} className="border border-slate-200 px-2 py-1 align-top">
                          <Inline parts={r[k] || []} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={i}>{body}</p>;
      })}
    </div>
  );
}

/** Which model wrote a reply, e.g. "openai/gpt-oss-120b" or "gemini-2.5-flash". */
export function ModelTag({ model, className = '' }) {
  if (!model) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] text-slate-400 ${className}`}>
      <Cpu size={12} /> {model}
    </span>
  );
}

/** "8 of 20 AI requests left today": the person's daily allowance. */
export function AiQuotaLine({ className = '' }) {
  const q = useAiQuota();
  if (!q) return null;
  const out = !q.left;
  return (
    <p className={`text-[11px] ${out ? 'text-red-600 font-medium' : 'text-slate-400'} ${className}`}>
      {q.unlimited
        ? `Staff: no daily limit · ${q.left} requests left in today's shared allowance`
        : out
          ? q.pool.left
            ? `You have used all ${q.limit} AI requests for today. They renew at midnight US Pacific time.`
            : "Today's free AI allowance is used up for everyone. It renews at midnight US Pacific time."
          : `${q.left} of ${q.limit} AI requests left today`}
    </p>
  );
}

const WAIT_HINTS = [
  [0, 'Sending to the AI…'],
  [4, 'The AI is writing the answer…'],
  [15, 'Still writing — longer answers take a little while…'],
  [30, 'The AI is busy, retrying — this can take up to a minute…'],
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

// ------------------------------------------------------------- textbooks
// "From my textbooks": the books indexed with tools/books/index-books.mjs. The
// choice is remembered on the device and shared by the tutor and explanations.
const BOOKS_PREF = 'aiBooks.v1';
const readPref = () => {
  try {
    return localStorage.getItem(BOOKS_PREF) === '1';
  } catch {
    return false;
  }
};

/** [indexed books ({ id: meta }) or null, on, setOn]. `on` is false while there are none. */
export function useBooks() {
  const [list, setList] = useState(null);
  const [on, setOnState] = useState(readPref);
  useEffect(() => subscribe('books/list', setList), []);
  const setOn = (v) => {
    setOnState(v);
    try {
      localStorage.setItem(BOOKS_PREF, v ? '1' : '0');
    } catch {
      /* private mode: remembered for this screen only */
    }
  };
  const has = !!list && Object.keys(list).length > 0;
  return [list, has && on, setOn, has];
}

function BooksToggle({ on, setOn }) {
  return (
    <button
      type="button"
      onClick={() => setOn(!on)}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
        on ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'
      }`}
    >
      <BookOpen size={14} /> From my textbooks{on ? ': on' : ''}
    </button>
  );
}

/** The passages a reply was built from, by number; tap one to read it. */
export function Sources({ sources }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 flex items-center gap-1">
        <BookOpen size={12} /> From your textbooks
      </p>
      {sources.map((s) => (
        <details key={s.n} className="text-xs text-slate-600">
          <summary className="cursor-pointer">
            [{s.n}] {s.title}, p. {s.page}
          </summary>
          <p className="mt-1 ml-3 pl-2 border-l-2 border-emerald-100 text-slate-500 leading-relaxed">{s.text}</p>
        </details>
      ))}
    </div>
  );
}

const isGemini = (model) => /gemini/i.test(model || '');

/**
 * Under a reply: asks the other provider (Groq or Gemini) the same request and
 * shows its answer below, to compare the two. Not saved with the chat.
 */
function CompareReply({ model, request }) {
  const other = isGemini(model) ? 'groq' : 'gemini';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reply, setReply] = useState(null);
  const abort = useRef(null);

  const compare = async () => {
    abort.current = new AbortController();
    setBusy(true);
    setError('');
    try {
      setReply(await askAi({ ...request, provider: other }, { signal: abort.current.signal }));
    } catch (e) {
      if (!abort.current.signal.aborted) setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (reply) {
    return (
      <div className="mt-2.5 pt-2.5 border-t border-dashed border-slate-200">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 mb-1">
          {other === 'gemini' ? 'Gemini' : 'Groq'}'s answer
        </p>
        <AiReply text={reply.text} />
        <Sources sources={reply.sources} />
        <ModelTag model={reply.model} className="mt-1.5" />
      </div>
    );
  }
  if (busy) return <AiWaiting className="mt-2.5" label={`Asking ${other === 'gemini' ? 'Gemini' : 'Groq'}…`} onCancel={() => abort.current?.abort()} />;
  return (
    <>
      <button onClick={compare} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-800">
        <GitCompare size={12} /> Compare with {other === 'gemini' ? 'Gemini' : 'Groq'}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </>
  );
}

// ---------------------------------------------------------------- agent
/** What the agent did before answering: one line per tool it used. */
function AgentSteps({ steps }) {
  if (!steps?.length) return null;
  return (
    <ul className="mb-2 space-y-0.5">
      {steps.map((st, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-500">
          <Check size={12} className="mt-0.5 shrink-0 text-emerald-500" /> {st.label}
        </li>
      ))}
    </ul>
  );
}

/** The practice quizzes the agent built, each opening like any quiz. */
function AgentQuizzes({ quizzes }) {
  if (!quizzes?.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {quizzes.map((q) => (
        <Link
          key={q.id}
          to={quizPath('ai', q.id)}
          className="flex items-center gap-2 rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm hover:bg-brand-50"
        >
          <ListChecks size={18} className="text-brand-600 shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-slate-900 truncate">{q.title}</span>
            <span className="block text-xs text-slate-500">{q.count} questions from the bank</span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
            <Play size={14} /> Open quiz
          </span>
        </Link>
      ))}
    </div>
  );
}

/** A choice the agent asked for; tapping one sends it as the next message. */
function AgentAsk({ ask, onPick, disabled }) {
  if (!ask?.options?.length) return null;
  return (
    <div className="mt-2">
      {ask.question && <p className="text-sm font-medium text-slate-800 mb-1.5">{ask.question}</p>}
      <div className="flex flex-wrap gap-1.5">
        {ask.options.map((o) => (
          <button
            key={o}
            type="button"
            disabled={disabled}
            onClick={() => onPick(o)}
            className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A tutor conversation. `context` (a question, card or topic) is sent with
 * every turn so follow-ups stay about the thing being studied; `seed` starts
 * the chat with an earlier reply, e.g. the AI explanation of a question;
 * `ask` sends a first question as soon as the chat opens; `seedRequest` is
 * the request that wrote the seed's first reply, so it can be compared too.
 * With `agent`, each message goes to the tutor with tools (functions/agent.js),
 * which may search the bank and the textbooks, build a quiz or ask back.
 */
export default function AiChat({ context, seed = [], seedRequest, ask, agent = false, onChange, placeholder = 'Ask anything about pediatrics…', className = '' }) {
  const [messages, setMessages] = useState(seed);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const request = useRef(0); // bumped on send and cancel; a stale reply is dropped
  const abort = useRef(null);
  const [partial, setPartial] = useState(''); // the reply so far, while it streams
  const [, booksOn, setBooksOn, hasBooks] = useBooks();

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
      const history = next.map(({ role, text: t }) => ({ role, text: t }));
      // The agent's answer arrives whole, after its tool steps.
      const res = agent
        ? await askAi({ task: 'agent', messages: history }, { signal: abort.current.signal })
        : await askAi(
            { task: 'chat', messages: history, context, books: booksOn },
            { signal: abort.current.signal, onText: (t) => id === request.current && setPartial((p) => p + t) },
          );
      if (id !== request.current) return;
      const reply = { role: 'model', text: res.text || res.ask?.question || '', model: res.model };
      if (res.sources?.length) reply.sources = res.sources;
      if (res.steps?.length) reply.steps = res.steps;
      if (res.quizzes?.length) reply.quizzes = res.quizzes;
      if (res.ask?.options?.length) reply.ask = res.ask;
      const done = [...next, reply];
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

  // What wrote reply i, to ask the other provider the same thing.
  const requestFor = (i) => {
    if (agent) return null; // tools ran and a quiz may have been saved: not repeated on the other model
    if (i === 0 && seedRequest) return seedRequest;
    if (messages[i - 1]?.role === 'user') {
      const before = messages.slice(0, i).map(({ role, text: t }) => ({ role, text: t }));
      return { task: 'chat', messages: before, context, books: !!messages[i].sources };
    }
    return null;
  };

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
              <AgentSteps steps={m.steps} />
              <AiReply text={m.ask && m.text === m.ask.question ? '' : m.text} />
              <AgentAsk ask={m.ask} disabled={busy || i !== messages.length - 1} onPick={send} />
              <AgentQuizzes quizzes={m.quizzes} />
              <Sources sources={m.sources} />
              <ModelTag model={m.model} className="mt-1.5" />
              {m.model && requestFor(i) && <CompareReply key={m.text} model={m.model} request={requestFor(i)} />}
            </div>
          ),
        )}
        {busy && partial && <StreamingReply text={partial} onCancel={cancel} />}
        {busy && !partial && (
          <AiWaiting className="mr-4" label={agent ? 'The tutor is working: it may search the bank and your textbooks first…' : undefined} onCancel={cancel} />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div ref={endRef} />
      </div>
      {hasBooks && !agent && (
        <div className="mt-3">
          <BooksToggle on={booksOn} setOn={setBooksOn} />
        </div>
      )}
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
      <AiQuotaLine className="mt-1.5" />
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
  const [, booksOn] = useBooks();

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
        { task: 'explain', question: q, books: booksOn },
        { signal: abort.current.signal, onText: (t) => id === request.current && setPartial((p) => p + t) },
      );
      if (id !== request.current) return;
      const first = [{ role: 'model', text: res.text, model: res.model, ...(res.sources ? { sources: res.sources } : {}) }];
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
      <AiQuotaLine className="mt-1.5" />

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
              seedRequest={{ task: 'explain', question: plain, books: !!messages?.[0]?.sources }}
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
