// The "Explain with AI" prompt (pure, no Firebase: tested by npm test).
//
// The AI gets this question (stem, every option, the key, the bank's own
// explanation) and the bank's linked questions with theirs, then explains the
// question, sums up what the linked questions say together, and ends with the
// main teaching point.
//
// Context is capped so the prompt still fits Groq's free per-minute token
// limit (gpt-oss: 8K tokens a minute, prompt + reply): at most MAX_LINKS
// linked questions and about LINK_BUDGET characters for all of them. The more
// links there are, the shorter each one is clipped.

export const EXPLAIN_VERSION = 2; // bump to retire saved explanations written by an older prompt
export const MAX_LINKS = 10;
export const LINK_BUDGET = 7000; // characters (~1,800 tokens) for all linked questions

const OPTS = ['a', 'b', 'c', 'd', 'e'];
const str = (v) => String(v ?? '').trim();
const clip = (s, n) => {
  const t = str(s).replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const ids = (v, ok) => (v && typeof v === 'object' ? Object.keys(v).filter((k) => v[k] && ok(k)) : []);

/**
 * Which linked questions to send: similar ones (same fact) first, then linked
 * ones (same condition). Copies of this question from other sittings ("same")
 * add nothing and are left out. `total` is how many links there are in all.
 */
export function pickLinks(me, qid, { max = MAX_LINKS, ok = () => true } = {}) {
  if (!me) return { pick: [], total: 0 };
  const same = new Set(ids(me.same, ok));
  const similar = ids(me.similar, ok).filter((k) => !same.has(k) && k !== qid);
  const related = ids(me.related, ok).filter((k) => !same.has(k) && !similar.includes(k) && k !== qid);
  const all = [...similar.map((id) => ({ kind: 'similar', id })), ...related.map((id) => ({ kind: 'linked', id }))];
  return { pick: all.slice(0, max), total: all.length };
}

/** Per-question clip lengths: full-ish for a few links, shorter for many. */
function limitsFor(n) {
  const scale = Math.min(1, 4 / Math.max(1, n));
  return {
    stem: Math.max(220, Math.round(600 * scale)),
    exp: Math.max(220, Math.round(600 * scale)),
    opt: Math.max(60, Math.round(150 * scale)),
  };
}

function linkText(kind, q, i, lim) {
  const answer = str(q.answer).toLowerCase();
  const opts = OPTS.filter((o) => str(q[o])).map((o) => `${o.toUpperCase()}. ${clip(q[o], lim.opt)}`).join(' / ');
  return [
    `Q${i} (${kind === 'similar' ? 'similar: same fact' : 'linked: same condition, connected point'}): ${clip(q.question, lim.stem)}`,
    opts,
    answer ? `Key: ${answer.toUpperCase()}${str(q[answer]) ? ` (${clip(q[answer], lim.opt)})` : ''}` : '',
    str(q.exp) ? `Bank explanation: ${clip(q.exp, lim.exp)}` : 'Bank explanation: none',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The linked questions as prompt text, within the budget. `rows` are
 * [{ kind, q }] in the order to send; `total` is how many links exist.
 * Returns { text, shown }.
 */
export function linkedBlock(rows, total = rows.length, budget = LINK_BUDGET) {
  const usable = (rows || []).filter((r) => str(r?.q?.question));
  if (!usable.length) return { text: '', shown: 0 };
  const lim = limitsFor(usable.length);
  const parts = [];
  let used = 0;
  for (const { kind, q } of usable) {
    const t = linkText(kind, q, parts.length + 1, lim);
    if (parts.length && used + t.length > budget) break;
    parts.push(t);
    used += t.length + 2;
  }
  const more = Math.max(0, total - parts.length);
  const head =
    `Linked questions from the same bank (${parts.length}` +
    `${more ? ` of ${total}; the other ${more} were left out for length` : ''}):`;
  return { text: `${head}\n\n${parts.join('\n\n')}`, shown: parts.length };
}

/** What to ask for. `shown` = how many linked questions are in the prompt. */
export function explainInstructions(shown = 0) {
  if (!shown) {
    return (
      'Explain this MCQ for exam revision, using its answer key and the bank explanation above: why the ' +
      'keyed answer is correct, then one line on why each other option is wrong. End with a short ' +
      '"**Main point:**" line worth memorising. If you believe the answer key is wrong, say so clearly and why.'
    );
  }
  return [
    'Explain this MCQ for exam revision. Use this question, its answer key and its bank explanation, and the',
    'linked questions with their keys and bank explanations. Write these parts in this order:',
    '1. Why the keyed answer is correct.',
    '2. One line on why each other option is wrong.',
    '3. "**What the linked questions say:**" 2-4 short "- " bullets summarising what the linked questions',
    'test and teach, grouping ones that make the same point (cite them as Q1, Q2). If a linked key',
    "contradicts this question's key, say so in one bullet.",
    '4. "**Main point:**" one line with the core teaching point this question and its linked questions',
    'share, worth memorising.',
    'If you believe the answer key is wrong, say so clearly and why. Keep the whole reply under about 350 words.',
  ].join('\n');
}

/** The whole user prompt for an explanation. */
export function explainPrompt(questionText, linked = { text: '', shown: 0 }) {
  return [`This question:\n${questionText}`, linked.text, explainInstructions(linked.shown)].filter(Boolean).join('\n\n');
}
