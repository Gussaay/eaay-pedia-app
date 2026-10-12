// Pieces of the AI study helper shared by the AI Study page and the quiz
// explanation: a safe renderer for a reply, and a small tutor chat.
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Cpu, Send, Sparkles } from 'lucide-react';
import { askAi } from '../lib/ai';
import { parseReply } from '../lib/aiFormat';
import { Button, Modal } from './ui';

/** Renders Gemini's light markdown as React nodes (never innerHTML). */
export function AiReply({ text, className = '' }) {
  return (
    <div className={`text-slate-700 leading-relaxed space-y-1.5 ${className}`}>
      {parseReply(text).map((b, i) => {
        const body = b.parts.map((p, j) => (p.bold ? <b key={j} className="text-slate-900">{p.text}</b> : <span key={j}>{p.text}</span>));
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

/**
 * A tutor conversation. `context` (a question, card or topic) is sent with
 * every turn so follow-ups stay about the thing being studied; `seed` starts
 * the chat with an earlier reply, e.g. the AI explanation of a question.
 */
export default function AiChat({ context, seed = [], placeholder = 'Ask anything about pediatrics…', className = '' }) {
  const [messages, setMessages] = useState(seed);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, busy]);

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...messages, { role: 'user', text: q }];
    setMessages(next);
    setText('');
    setError('');
    setBusy(true);
    try {
      const res = await askAi({ task: 'chat', messages: next, context });
      setMessages((m) => [...m, { role: 'model', text: res.text, model: res.model }]);
    } catch (e) {
      setError(e.message);
      setMessages(messages);
      setText(q);
    } finally {
      setBusy(false);
    }
  };

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
        {busy && (
          <p className="text-sm text-slate-400 flex items-center gap-2">
            <Sparkles size={16} className="animate-pulse text-brand-500" /> Thinking…
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 mt-3 items-end">
        <textarea
          rows={1}
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
 * open in a pop-up; closing it keeps the reply, so it reopens without a new
 * request.
 */
export function AiExplain({ question }) {
  const [reply, setReply] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setReply(null);
    setOpen(false);
    setError('');
  }, [question._key]);

  const explain = async () => {
    setOpen(true);
    if (reply || busy) return;
    setBusy(true);
    setError('');
    try {
      const { _key, ...q } = question;
      const res = await askAi({ task: 'explain', question: q });
      setReply({ text: res.text, model: res.model });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const { _key, ...plain } = question;
  return (
    <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-3">
      <Button variant="ghost" className="!px-0 !text-violet-700 w-full !justify-between" onClick={explain}>
        <span className="flex items-center gap-2">
          <Sparkles size={18} /> {reply ? 'Open AI explanation' : 'Explain with AI'}
        </span>
        <ChevronRight size={18} />
      </Button>

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
        {busy && (
          <p className="text-sm text-slate-400 flex items-center gap-2 py-6">
            <Sparkles size={16} className="animate-pulse text-violet-500" /> Explaining this question…
          </p>
        )}
        {error && (
          <div className="py-4">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" className="mt-3" onClick={() => { setError(''); explain(); }}>
              Try again
            </Button>
          </div>
        )}
        {reply && (
          <>
            <AiChat
              key={_key}
              context={{ kind: 'question', question: plain }}
              seed={[{ role: 'model', text: reply.text, model: reply.model }]}
              placeholder="Ask a follow-up…"
            />
            <p className="text-[11px] text-slate-400 mt-2">AI can be wrong — check important facts against your references.</p>
          </>
        )}
      </Modal>
    </div>
  );
}
