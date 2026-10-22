// AI Study: an AI agent (tutor with tools), tutor, practice quiz, flashcard and mnemonic generator
// (GPT-OSS on Groq, Gemini as backup). Admin-only — the API keys belong to the
// app owner and live in the `aiStudy` Cloud Function (functions/ai.js), never in the app.
//
// Nothing generated here is saved to the question bank. An admin who wants to
// keep a set downloads it as CSV and puts it through the normal Import, where
// the preview and duplicate checks still apply.
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Bot, Brain, Download, Layers, Lightbulb, ListChecks, MessageCircle, RotateCcw, Sparkles, Gauge } from 'lucide-react';
import { askAi } from '../lib/ai';
import { cardsToCsv, mcqsToCsv, normalizeCards, normalizeMcqs } from '../lib/aiFormat';
import { OPTION_KEYS } from '../lib/quiz';
import { LEVELS } from '../config';
import { useAuth } from '../hooks/useAuth';
import { subscribe } from '../lib/rtdb';
import AiChat, { AiReply, ModelTag, useBooks } from '../components/AiChat';
import { AppBar, Button, Card, Empty, Input, Page, Select } from '../components/ui';

const TABS = [
  { key: 'agent', label: 'Agent', icon: Bot },
  { key: 'tutor', label: 'Tutor', icon: MessageCircle },
  { key: 'quiz', label: 'Quiz me', icon: ListChecks },
  { key: 'cards', label: 'Flashcards', icon: Layers },
  { key: 'mnemonic', label: 'Mnemonic', icon: Lightbulb },
];

function download(name, csv) {
  // BOM so Excel keeps UTF-8, as the import templates do.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'topic';

/** Topic box + Generate button shared by the generator tabs. */
function TopicForm({ placeholder, busy, onSubmit, children }) {
  const [topic, setTopic] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (topic.trim()) onSubmit(topic.trim());
      }}
    >
      <Input label="Topic" placeholder={placeholder} value={topic} onChange={(e) => setTopic(e.target.value)} />
      {children}
      <Button type="submit" className="w-full" loading={busy} disabled={!topic.trim()}>
        {!busy && <Sparkles size={18} />} {busy ? 'Generating…' : 'Generate'}
      </Button>
    </form>
  );
}

function useGenerate() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (data) => {
    setBusy(true);
    setError('');
    try {
      return await askAi(data);
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

// ------------------------------------------------------------------- quiz
function QuizTab() {
  const { profile } = useAuth();
  const { busy, error, run } = useGenerate();
  const [count, setCount] = useState('5');
  const [level, setLevel] = useState(LEVELS.includes(profile?.level) ? profile.level : LEVELS[1]);
  const [set, setSet] = useState(null);
  const [picked, setPicked] = useState({});

  const generate = async (topic) => {
    const res = await run({ task: 'quiz', topic, count, level });
    if (!res) return;
    const qs = normalizeMcqs(res.items);
    setSet(qs.length ? { topic, qs, model: res.model } : null);
    setPicked({});
  };

  const answered = Object.keys(picked).length;
  const right = set ? set.qs.filter((q, i) => picked[i] === q.answer).length : 0;

  return (
    <>
      <Card className="p-4">
        <TopicForm placeholder="e.g. Nephrotic syndrome, neonatal jaundice" busy={busy} onSubmit={generate}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Questions" value={count} onChange={(e) => setCount(e.target.value)}>
              {['5', '10', '15', '20'].map((n) => <option key={n}>{n}</option>)}
            </Select>
            <Select label="Level" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => <option key={l}>{l}</option>)}
            </Select>
          </div>
        </TopicForm>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </Card>

      {set && (
        <>
          <div className="flex items-center justify-between mt-4 mb-2">
            <p className="text-sm text-slate-600">
              <b>{set.topic}</b> · {answered}/{set.qs.length} answered{answered ? ` · ${right} correct` : ''}
              <ModelTag model={set.model} />
            </p>
            <Button variant="ghost" className="!py-1 text-sm" onClick={() => download(`ai-mcqs-${slug(set.topic)}.csv`, mcqsToCsv(set.qs))}>
              <Download size={16} /> CSV
            </Button>
          </div>
          <div className="space-y-3">
            {set.qs.map((q, i) => {
              const choice = picked[i];
              return (
                <Card key={i} className="p-4">
                  <p className="font-medium text-slate-900 whitespace-pre-line">
                    {i + 1}. {q.question}
                  </p>
                  <div className="mt-3 space-y-2">
                    {OPTION_KEYS.filter((k) => q[k]).map((k) => {
                      const tone = !choice
                        ? 'border-slate-200 hover:bg-slate-50'
                        : k === q.answer
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                          : k === choice
                            ? 'border-red-300 bg-red-50 text-red-800'
                            : 'border-slate-100 text-slate-400';
                      return (
                        <button
                          key={k}
                          disabled={!!choice}
                          onClick={() => setPicked((p) => ({ ...p, [i]: k }))}
                          className={`w-full text-left rounded-xl border px-3 py-2 transition ${tone}`}
                        >
                          <b className="uppercase mr-1">{k}.</b> {q[k]}
                        </button>
                      );
                    })}
                  </div>
                  {choice && q.exp && <AiReply text={q.exp} className="mt-3 text-sm bg-slate-50 rounded-xl p-3" />}
                </Card>
              );
            })}
          </div>
          {answered === set.qs.length && (
            <Button variant="outline" className="w-full mt-4" onClick={() => setPicked({})}>
              <RotateCcw size={16} /> Try again ({right}/{set.qs.length})
            </Button>
          )}
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ cards
function CardsTab() {
  const { busy, error, run } = useGenerate();
  const [count, setCount] = useState('10');
  const [deck, setDeck] = useState(null);
  const [pos, setPos] = useState(0);
  const [shown, setShown] = useState(false);

  const generate = async (topic) => {
    const res = await run({ task: 'cards', topic, count });
    if (!res) return;
    const cards = normalizeCards(res.items);
    setDeck(cards.length ? { topic, cards, model: res.model } : null);
    setPos(0);
    setShown(false);
  };

  const go = (d) => {
    setPos((p) => Math.max(0, Math.min(deck.cards.length - 1, p + d)));
    setShown(false);
  };
  const card = deck?.cards[pos];

  return (
    <>
      <Card className="p-4">
        <TopicForm placeholder="e.g. Developmental milestones, vaccine schedule" busy={busy} onSubmit={generate}>
          <Select label="Cards" value={count} onChange={(e) => setCount(e.target.value)}>
            {['10', '20', '30', '40'].map((n) => <option key={n}>{n}</option>)}
          </Select>
        </TopicForm>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </Card>

      {card && (
        <>
          <div className="flex items-center justify-between mt-4 mb-2">
            <p className="text-sm text-slate-600">
              <b>{deck.topic}</b> · card {pos + 1} of {deck.cards.length}
              <ModelTag model={deck.model} />
            </p>
            <Button variant="ghost" className="!py-1 text-sm" onClick={() => download(`ai-cards-${slug(deck.topic)}.csv`, cardsToCsv(deck.cards))}>
              <Download size={16} /> CSV
            </Button>
          </div>
          <button
            onClick={() => setShown((s) => !s)}
            className="w-full min-h-[14rem] rounded-3xl bg-white border border-slate-100 shadow-sm p-6 flex flex-col justify-center text-center"
          >
            <p className="font-display text-lg text-slate-900 whitespace-pre-line">{card.front}</p>
            {shown ? (
              <p className="mt-4 pt-4 border-t border-slate-100 text-slate-700 whitespace-pre-line">{card.back}</p>
            ) : (
              <>
                {card.hint && <p className="mt-3 text-sm text-slate-400">Hint: {card.hint}</p>}
                <p className="mt-4 text-sm text-brand-600 font-semibold">Tap to show the answer</p>
              </>
            )}
          </button>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Button variant="outline" onClick={() => go(-1)} disabled={pos === 0}>
              <ArrowLeft size={16} /> Previous
            </Button>
            <Button onClick={() => go(1)} disabled={pos === deck.cards.length - 1}>
              Next <ArrowRight size={16} />
            </Button>
          </div>
        </>
      )}
    </>
  );
}

// --------------------------------------------------------------- mnemonic
function MnemonicTab() {
  const { busy, error, run } = useGenerate();
  const [result, setResult] = useState(null);

  const generate = async (topic) => {
    const res = await run({ task: 'mnemonic', topic });
    if (res) setResult({ topic, text: res.text, model: res.model });
  };

  return (
    <>
      <Card className="p-4">
        <TopicForm placeholder="e.g. Causes of neonatal hypoglycaemia" busy={busy} onSubmit={generate} />
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </Card>
      {result && (
        <Card className="p-4 mt-4">
          <p className="text-sm font-semibold text-teal-700 flex items-center gap-1.5 mb-2">
            <Lightbulb size={16} /> {result.topic}
          </p>
          <AiChat
            key={result.text}
            context={{ kind: 'text', text: `Mnemonic for ${result.topic}` }}
            seed={[{ role: 'model', text: result.text, model: result.model }]}
            seedRequest={{ task: 'mnemonic', topic: result.topic }}
            placeholder="Ask for another version, or what a letter means…"
          />
        </Card>
      )}
    </>
  );
}

// ------------------------------------------------------------------ usage
// Groq's and Gemini's free tiers count requests per model per day. The aiStudy
// function records each request, the daily limit Groq reports with every
// reply, and the one Google reports when a model runs out (functions/ai.js).
// The count here restarts at midnight Pacific time.
const usageDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

function hoursToPacificMidnight() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((p) => [p.type, Number(p.value)]),
  );
  const mins = 24 * 60 - (parts.hour * 60 + parts.minute);
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}

function AiUsage() {
  const [day, setDay] = useState(null);
  const [limits, setLimits] = useState(null);
  useEffect(() => subscribe(`aiUsage/days/${usageDay()}`, setDay), []);
  useEffect(() => subscribe('aiUsage/limits', setLimits), []);

  const keys = [...new Set([...Object.keys(day || {}), ...Object.keys(limits || {})])].sort();
  return (
    <Card className="p-4 mb-4">
      <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
        <Gauge size={16} className="text-brand-600" /> AI requests today
      </p>
      {!keys.length ? (
        <p className="text-sm text-slate-500 mt-2">No requests yet today.</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {keys.map((k) => {
            const used = Number(day?.[k]?.used) || 0;
            const limit = Number(limits?.[k]) || 0;
            const out = Number(day?.[k]?.resetAt) > Date.now();
            const left = limit ? Math.max(0, limit - used) : null;
            const pct = out ? 100 : limit ? Math.min(100, (used / limit) * 100) : 0;
            return (
              <div key={k}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-slate-700 truncate">{k.replace(/^openai_/, '').replace(/_/g, '.')}</span>
                  <span className={`shrink-0 font-semibold ${out ? 'text-red-600' : 'text-slate-600'}`}>
                    {out ? 'used up' : limit ? `${left} of ${limit} left` : `${used} used`}
                  </span>
                </div>
                {(limit > 0 || out) && (
                  <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                    <div className={`h-full rounded-full ${out || pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-3">
        Counts requests from this app on the free tiers. Resets in {hoursToPacificMidnight()} (midnight US Pacific time).
        A Gemini model's limit shows once Google has reported it. Groq also caps tokens a day, which long answers can
        use up before the request count.
      </p>
    </Card>
  );
}

// -------------------------------------------------------------- textbooks
/** The books the tutor can answer from (indexed with tools/books/index-books.mjs). */
function BooksCard() {
  const [list] = useBooks();
  const books = Object.values(list || {}).sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return (
    <Card className="p-4 mb-4">
      <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
        <BookOpen size={16} className="text-emerald-600" /> Your textbooks
      </p>
      {!books.length ? (
        <p className="text-sm text-slate-500 mt-2">
          None yet. Index PDFs with tools/books/index-books.mjs to turn on "From my textbooks" in the tutor.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {books.map((b) => (
            <li key={b.title} className="flex justify-between gap-2">
              <span className="truncate">{b.title}</span>
              <span className="shrink-0 text-xs text-slate-400">{b.pages} pages</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ agent
function AgentIntro() {
  return (
    <div className="mb-3 rounded-xl bg-violet-50/60 border border-violet-100 px-3 py-2 text-xs text-slate-600 leading-relaxed">
      <p className="font-semibold text-violet-800 mb-0.5">A tutor that can do things</p>
      It searches the question bank and your textbooks, looks at how you are doing, builds practice quizzes you can
      open right away, and asks you when it needs a choice. Each message can use a few AI requests.
    </div>
  );
}

// ------------------------------------------------------------------- page
export default function AiStudy() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('agent');

  return (
    <>
      <AppBar title="AI Study" subtitle="Agent, tutor, quizzes, flashcards and mnemonics" />
      <Page>
        {!isAdmin ? (
          <Empty icon={<Brain size={40} />} title="Admins only">
            The AI study helper is currently available to admin accounts only.
          </Empty>
        ) : (
          <>
            <AiUsage />
            <BooksCard />
            <div className="grid grid-cols-5 gap-1 bg-slate-100 rounded-2xl p-1 mb-4">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-semibold transition ${
                    tab === key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Icon size={18} /> {label}
                </button>
              ))}
            </div>

            {/* Kept mounted so switching tabs does not throw away a chat or a set. */}
            <div className={tab === 'agent' ? '' : 'hidden'}>
              <Card className="p-4">
                <AgentIntro />
                <AiChat agent placeholder="e.g. Quiz me on my weak topics, or 10 questions on Kawasaki" />
              </Card>
            </div>
            <div className={tab === 'tutor' ? '' : 'hidden'}>
              <Card className="p-4">
                <AiChat placeholder="Ask anything — e.g. approach to a child with stridor" />
              </Card>
            </div>
            <div className={tab === 'quiz' ? '' : 'hidden'}><QuizTab /></div>
            <div className={tab === 'cards' ? '' : 'hidden'}><CardsTab /></div>
            <div className={tab === 'mnemonic' ? '' : 'hidden'}><MnemonicTab /></div>

            <p className="text-[11px] text-slate-400 text-center mt-6">
              Generated by GPT-OSS on Groq, or Google Gemini as a backup. AI can be wrong — check important facts against your references.
            </p>
          </>
        )}
      </Page>
    </>
  );
}
