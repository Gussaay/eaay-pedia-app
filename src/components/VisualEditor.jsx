// Editing a drawn mnemonic (see MnemonicVisual.jsx) with ordinary form fields
// and a live preview, instead of typing its description by hand. The raw
// description is still one tap away for anything the form does not cover.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Code2, Plus, Trash2 } from 'lucide-react';
import MnemonicVisual, { readVisual } from './MnemonicVisual';

const TONES = ['#0F7B6C', '#1976D2', '#6B4FB3', '#C2185B', '#D84315', '#B7791F', '#2E7D32', '#455A64'];

const DIAGRAMS = [
  { key: '', label: 'No diagram' },
  { key: 'acrostic', label: 'Letters (acrostic)' },
  { key: 'facts', label: 'Icon points' },
  { key: 'flow', label: 'Pathway with blocks' },
  { key: 'arrows', label: 'Up / down arrows' },
  { key: 'ladder', label: 'Ladder (strongest first)' },
  { key: 'compare', label: 'Two columns' },
  { key: 'track', label: 'Track (one lit)' },
];

/** A sensible empty diagram of a type, reusing any list already typed. */
function blankDiagram(type, old = {}) {
  const words = [
    ...(old.items || []).map((x) => (typeof x === 'string' ? x : x.w || x.text || x.label || '')),
    ...(old.steps || []),
    ...(old.rungs || []).map((r) => r.label),
    ...(old.segments || []),
  ].filter(Boolean);
  const list = words.length ? words : ['', ''];
  switch (type) {
    case 'acrostic':
      return { type, items: list.map((w) => ({ l: String(w).charAt(0).toUpperCase(), w, d: '' })) };
    case 'facts':
      return { type, items: list.map((text) => ({ icon: '✅', text })) };
    case 'flow':
      return { type, steps: list, block: [], by: '' };
    case 'arrows':
      return { type, items: list.map((label) => ({ label, dir: 'up' })) };
    case 'ladder':
      return { type, rungs: list.map((label) => ({ label, sub: '' })) };
    case 'compare':
      return { type, left: { title: '', items: list }, right: { title: '', items: [] } };
    case 'track':
      return { type, segments: list, at: 0, labels: [] };
    default:
      return null;
  }
}

const box = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal-500';
const field = `w-full ${box}`;
// In a row: fixed-width columns keep their width, the rest share what is left.
const cell = (width) => `${box} ${width ? `${width} shrink-0` : 'w-0 min-w-0 flex-1'}`;

function Labelled({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

/** Rows of small fields with add, remove and reorder. */
function Rows({ rows = [], columns, onChange, blank }) {
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i, step) => {
    const next = [...rows];
    const [x] = next.splice(i, 1);
    next.splice(i + step, 0, x);
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {columns.map((c) =>
            c.options ? (
              <select key={c.key} className={cell(c.width)} value={r[c.key] || ''} onChange={(e) => set(i, { [c.key]: e.target.value })}>
                {c.options.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <input
                key={c.key}
                className={cell(c.width)}
                placeholder={c.placeholder}
                value={r[c.key] ?? ''}
                onChange={(e) => set(i, { [c.key]: e.target.value })}
              />
            ),
          )}
          <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-slate-400 disabled:opacity-30" aria-label="Move up">
            <ArrowUp size={15} />
          </button>
          <button type="button" disabled={i === rows.length - 1} onClick={() => move(i, 1)} className="p-1 text-slate-400 disabled:opacity-30" aria-label="Move down">
            <ArrowDown size={15} />
          </button>
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="p-1 text-slate-400 hover:text-red-600" aria-label="Remove">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, { ...blank }])} className="flex items-center gap-1 text-sm font-semibold text-teal-700">
        <Plus size={15} /> Add
      </button>
    </div>
  );
}

// Plain string lists are edited as rows of { v } and stored back as strings.
const toRows = (list = []) => list.map((v) => ({ v }));
const fromRows = (rows = []) => rows.map((r) => r.v);

function DiagramFields({ d, onChange }) {
  const set = (patch) => onChange({ ...d, ...patch });
  switch (d.type) {
    case 'acrostic':
      return (
        <Rows
          rows={d.items}
          blank={{ l: '', w: '', d: '' }}
          columns={[
            { key: 'l', placeholder: 'Letter', width: 'w-16' },
            { key: 'w', placeholder: 'Word' },
            { key: 'd', placeholder: 'Detail (optional)' },
          ]}
          onChange={(items) => set({ items })}
        />
      );
    case 'facts':
      return (
        <Rows
          rows={d.items}
          blank={{ icon: '✅', text: '' }}
          columns={[
            { key: 'icon', placeholder: '🙂', width: 'w-14' },
            { key: 'text', placeholder: 'Point' },
          ]}
          onChange={(items) => set({ items })}
        />
      );
    case 'arrows':
      return (
        <Rows
          rows={d.items}
          blank={{ label: '', dir: 'up' }}
          columns={[
            { key: 'label', placeholder: 'What goes up or down' },
            { key: 'dir', width: 'w-24', options: [['up', '↑ Up'], ['down', '↓ Down']] },
          ]}
          onChange={(items) => set({ items })}
        />
      );
    case 'ladder':
      return (
        <Rows
          rows={d.rungs}
          blank={{ label: '', sub: '' }}
          columns={[
            { key: 'label', placeholder: 'Rung' },
            { key: 'sub', placeholder: 'Detail (optional)' },
          ]}
          onChange={(rungs) => set({ rungs })}
        />
      );
    case 'flow': {
      const blocks = Array.isArray(d.block) ? d.block : d.block === undefined || d.block === null || d.block === '' ? [] : [d.block];
      return (
        <div className="space-y-2">
          <Rows rows={toRows(d.steps)} blank={{ v: '' }} columns={[{ key: 'v', placeholder: 'Step' }]} onChange={(r) => set({ steps: fromRows(r) })} />
          {(d.steps || []).length > 1 && (
            <div>
              <span className="text-xs font-semibold text-slate-600">Blocked arrows</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {d.steps.slice(0, -1).map((s, i) => (
                  <label key={i} className="flex items-center gap-1 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={blocks.includes(i)}
                      onChange={(e) => set({ block: e.target.checked ? [...blocks, i].sort() : blocks.filter((b) => b !== i) })}
                    />
                    {s || `Step ${i + 1}`} → {d.steps[i + 1] || `Step ${i + 2}`}
                  </label>
                ))}
              </div>
            </div>
          )}
          <Labelled label="Blocked by">
            <input className={field} value={d.by || ''} onChange={(e) => set({ by: e.target.value })} placeholder="Drug name" />
          </Labelled>
        </div>
      );
    }
    case 'compare':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {['left', 'right'].map((side) => (
            <div key={side} className="space-y-1.5">
              <input
                className={field}
                placeholder={side === 'left' ? 'Left heading' : 'Right heading'}
                value={d[side]?.title || ''}
                onChange={(e) => set({ [side]: { ...d[side], title: e.target.value } })}
              />
              <Rows
                rows={toRows(d[side]?.items)}
                blank={{ v: '' }}
                columns={[{ key: 'v', placeholder: 'Point' }]}
                onChange={(r) => set({ [side]: { ...d[side], items: fromRows(r) } })}
              />
            </div>
          ))}
        </div>
      );
    case 'track': {
      const rows = (d.segments || []).map((s, i) => ({ v: s, label: d.labels?.[i] || '' }));
      return (
        <div className="space-y-2">
          <Rows
            rows={rows}
            blank={{ v: '', label: '' }}
            columns={[
              { key: 'v', placeholder: 'Segment' },
              { key: 'label', placeholder: 'Label under it (optional)' },
            ]}
            onChange={(r) => set({ segments: r.map((x) => x.v), labels: r.map((x) => x.label) })}
          />
          <Labelled label="Lit segment">
            <select className={field} value={d.at ?? 0} onChange={(e) => set({ at: Number(e.target.value) })}>
              {(d.segments || []).map((s, i) => (
                <option key={i} value={i}>
                  {s || `Segment ${i + 1}`}
                </option>
              ))}
            </select>
          </Labelled>
        </div>
      );
    }
    default:
      return null;
  }
}

/**
 * value: the visual object (or null); onChange(visual).
 * Shows the form and, beside or under it, the card as it will look.
 */
export default function VisualEditor({ value, onChange, source }) {
  const v = readVisual(value) || {};
  const [raw, setRaw] = useState(null); // text while editing as JSON
  const [rawError, setRawError] = useState('');
  const set = (patch) => onChange({ ...v, ...patch });
  const d = v.diagram || null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Illustration</span>
          <button
            type="button"
            onClick={() => {
              setRaw(raw === null ? JSON.stringify(v, null, 2) : null);
              setRawError('');
            }}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-teal-700"
          >
            <Code2 size={14} /> {raw === null ? 'Edit as JSON' : 'Back to the form'}
          </button>
        </div>

        {raw !== null ? (
          <div>
            <textarea
              className="min-h-[22rem] w-full rounded-xl border border-slate-300 bg-white p-2 font-mono text-xs"
              value={raw}
              spellCheck={false}
              onChange={(e) => {
                setRaw(e.target.value);
                try {
                  const parsed = JSON.parse(e.target.value);
                  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected { … }');
                  setRawError('');
                  onChange(parsed);
                } catch (err) {
                  setRawError(err.message);
                }
              }}
            />
            {rawError && <p className="text-xs text-red-600">Not valid yet: {rawError}</p>}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[4.5rem_1fr] gap-2">
              <Labelled label="Picture">
                <input className={`${field} text-center text-2xl`} value={v.emoji || ''} onChange={(e) => set({ emoji: e.target.value })} placeholder="💡" />
              </Labelled>
              <Labelled label="Title">
                <input className={field} value={v.title || ''} onChange={(e) => set({ title: e.target.value })} placeholder="Short name of the topic" />
              </Labelled>
            </div>
            <Labelled label="Subtitle (optional)">
              <input className={field} value={v.tag || ''} onChange={(e) => set({ tag: e.target.value })} />
            </Labelled>
            <div>
              <span className="text-xs font-semibold text-slate-600">Colour</span>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set({ tone: t })}
                    className={`h-7 w-7 rounded-full border-2 ${(v.tone || '#0F7B6C') === t ? 'border-slate-900' : 'border-white'}`}
                    style={{ background: t }}
                    aria-label={`Colour ${t}`}
                  />
                ))}
                <input type="color" value={v.tone || '#0F7B6C'} onChange={(e) => set({ tone: e.target.value })} className="h-7 w-9" aria-label="Any colour" />
              </div>
            </div>
            <Labelled label="Answer" hint="The plain answer to the front, shown under the title.">
              <textarea className={field} rows={2} value={v.answer || ''} onChange={(e) => set({ answer: e.target.value })} />
            </Labelled>
            <Labelled label="Hook" hint="The line to remember. Put key letters in [brackets] to light them up.">
              <textarea className={field} rows={2} value={v.hook || ''} onChange={(e) => set({ hook: e.target.value })} />
            </Labelled>
            <Labelled label="Diagram">
              <select
                className={field}
                value={d?.type || ''}
                onChange={(e) => set({ diagram: blankDiagram(e.target.value, d || {}) })}
              >
                {DIAGRAMS.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Labelled>
            {d && <DiagramFields d={d} onChange={(diagram) => set({ diagram })} />}
            <Labelled label="Exam trap (optional)">
              <input className={field} value={v.trap || ''} onChange={(e) => set({ trap: e.target.value })} />
            </Labelled>
          </>
        )}
      </div>

      <div className="h-[34rem] rounded-2xl border border-slate-200 bg-slate-50 p-2 lg:sticky lg:top-4">
        {v.title || v.hook ? (
          <MnemonicVisual visual={v} source={source} />
        ) : (
          <p className="p-4 text-sm text-slate-400">The card appears here as you fill it in.</p>
        )}
      </div>
    </div>
  );
}
