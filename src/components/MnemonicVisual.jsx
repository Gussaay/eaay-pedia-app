// The back of a visual mnemonic, drawn from a small description instead of an
// uploaded picture.
//
// A card stores something like
//
//   { title: 'Vigabatrin', emoji: '👁️', tone: '#6B4FB3',
//     hook: '[VI]sual fields [G]one',
//     diagram: { type: 'flow', steps: ['GABA', 'Breakdown'], block: 0, by: 'Vigabatrin' },
//     trap: 'Not a GABA agonist' }
//
// and this draws it: a big picture anchor, the hook with its key letters
// lit up, and one diagram. It is under 1 KB per card where an image is ~55 KB,
// it stays sharp at any size, and a typo is a one-field edit.
//
// Styles are inline on purpose: the same component renders the comparison
// page outside the app, where there is no Tailwind stylesheet.
//
// Diagram types:
//   acrostic  items: [{ l, w, d? }]                 big letter tiles
//   flow      steps: [..], block?: i|[i], by?: '..' boxes with arrows, some cut
//   arrows    items: [{ label, dir: 'up'|'down' }]   rising / falling arrows
//   ladder    rungs: [{ label, sub? }] top → bottom  stacked bars, strongest first
//   compare   left/right: { title, items: [..] }    two columns
//   track     segments: [..], at: i, labels?: [..]  a row with one segment lit
//   facts     items: [{ icon, text }]               a few icon-led points
//
// `answer` (optional) is the plain answer to the card's question, shown under
// the title so the picture never has to carry the whole fact on its own.

import { useLayoutEffect, useRef } from 'react';

const ink = '#17232b';

// The smallest a card's content is shrunk to make it fit the face before it
// scrolls instead. Below this the small print stops being comfortable.
const MIN_FIT = 0.72;
const muted = '#5b6b75';

/** "[VI]sual fields [G]one" -> text with the bracketed parts highlighted. */
function Hook({ text, tone }) {
  const parts = String(text || '').split(/(\[[^\]]+\])/g);
  return (
    <p style={{ margin: 0, fontSize: 21, lineHeight: 1.35, fontWeight: 600, color: ink, textAlign: 'center' }}>
      {parts.map((p, i) =>
        p.startsWith('[') && p.endsWith(']') ? (
          <span key={i} style={{ color: tone, fontWeight: 900, fontSize: '1.15em' }}>
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

const soft = (hex, alpha) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

function Acrostic({ items = [], tone }) {
  // Long lists (PHENYTOIN, VALPROATE…) get smaller tiles so they still fit.
  const tight = items.length > 6;
  const tile = tight ? 30 : 40;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tight ? 4 : 6 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              flex: `0 0 ${tile}px`,
              height: tile,
              borderRadius: 10,
              background: tone,
              color: '#fff',
              fontWeight: 900,
              fontSize: tight ? 16 : 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {it.l}
          </span>
          <span style={{ fontSize: tight ? 14 : 16, color: ink, lineHeight: 1.2 }}>
            <b>{it.w}</b>
            {it.d ? <span style={{ color: muted }}> · {it.d}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function Flow({ steps = [], block, by, tone }) {
  // `block` is the arrow (by index) the drug cuts; a list cuts several.
  const cut = (i) => (Array.isArray(block) ? block.includes(i) : block === i);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 2 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              border: `2px solid ${tone}`,
              borderRadius: 12,
              padding: '7px 7px',
              fontSize: 13,
              fontWeight: 700,
              color: ink,
              background: '#fff',
              textAlign: 'center',
              maxWidth: 92,
              lineHeight: 1.2,
            }}
          >
            {s}
          </span>
          {i < steps.length - 1 && (
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 22 }}>
              <span style={{ fontSize: 22, lineHeight: 1, color: cut(i) ? '#c0392b' : ink, fontWeight: 900 }}>
                {cut(i) ? '✕' : '→'}
              </span>
              {cut(i) && by ? (
                <span style={{ fontSize: 10, fontWeight: 800, color: '#c0392b', textAlign: 'center', maxWidth: 70 }}>
                  {by}
                </span>
              ) : null}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Arrows({ items = [], tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', gap: 4 }}>
      {items.map((it, i) => {
        const up = it.dir !== 'down';
        const colour = up ? tone : '#c0392b';
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
            <svg viewBox="0 0 40 60" width="34" height="52" aria-hidden="true">
              {up ? (
                <path d="M20 2 L38 24 H27 V58 H13 V24 H2 Z" fill={colour} />
              ) : (
                <path d="M20 58 L38 36 H27 V2 H13 V36 H2 Z" fill={colour} />
              )}
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: ink, textAlign: 'center', lineHeight: 1.15 }}>
              {it.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Ladder({ rungs = [], tone }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {rungs.map((r, i) => (
        <div
          key={i}
          style={{
            width: `${100 - (i * 30) / Math.max(1, rungs.length - 1)}%`,
            boxSizing: 'border-box',
            background: soft(tone, 0.85 - (i * 0.6) / Math.max(1, rungs.length - 1)),
            borderRadius: 10,
            padding: '6px 10px',
            color: i < rungs.length / 2 ? '#fff' : ink,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800 }}>{r.label}</div>
          {r.sub ? <div style={{ fontSize: 12, opacity: 0.9 }}>{r.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

function Compare({ left, right, tone }) {
  const col = (side, colour) => (
    <div style={{ flex: 1, border: `2px solid ${colour}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <div style={{ background: colour, color: '#fff', fontWeight: 800, fontSize: 15, padding: '6px 8px', textAlign: 'center' }}>
        {side?.title}
      </div>
      <div style={{ padding: '2px 8px', display: 'flex', flexDirection: 'column' }}>
        {(side?.items || []).map((x, i) => (
          // A faint rule between rows so each pair reads as its own line.
          <span key={i} style={{ fontSize: 13, color: ink, lineHeight: 1.25, padding: '5px 0', borderTop: i ? `1px solid ${soft(colour, 0.25)}` : 'none' }}>
            {x}
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {col(left, tone)}
      {col(right, '#475569')}
    </div>
  );
}

function Track({ segments = [], at, labels = [], tone }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {segments.map((s, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              width: '100%',
              borderRadius: 999,
              padding: '8px 2px',
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 800,
              background: i === at ? tone : '#eef1f4',
              color: i === at ? '#fff' : muted,
              border: i === at ? 'none' : '1px solid #d9e1e5',
            }}
          >
            {s}
          </span>
          {labels[i] ? (
            <span style={{ fontSize: 11, fontWeight: i === at ? 900 : 500, color: i === at ? tone : muted, textAlign: 'center' }}>
              {labels[i]}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Facts({ items = [], tone }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              flex: '0 0 40px',
              height: 40,
              borderRadius: 12,
              background: soft(tone, 0.12),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
            }}
            aria-hidden="true"
          >
            {it.icon}
          </span>
          <span style={{ fontSize: 15, color: ink, lineHeight: 1.25, fontWeight: 600 }}>{it.text}</span>
        </div>
      ))}
    </div>
  );
}

const DIAGRAMS = { acrostic: Acrostic, flow: Flow, arrows: Arrows, ladder: Ladder, compare: Compare, track: Track, facts: Facts };

/** Parses the stored value, which may arrive as an object or a JSON string. */
export function readVisual(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** `source` (optional) is where the mnemonic comes from, shown at the foot. */
export default function MnemonicVisual({ visual, source }) {
  const v = readVisual(visual);
  const outer = useRef(null);
  const inner = useRef(null);

  // Shrink a long card to fit its face, so the whole picture is seen at once
  // — a mnemonic is remembered as one image, not read by scrolling. CSS zoom
  // (not a transform) so the text re-flows at the smaller size.
  useLayoutEffect(() => {
    const box = outer.current;
    const body = inner.current;
    if (!box || !body) return undefined;
    const fit = () => {
      // Measured at natural height (no min-height), then stretched back to
      // fill the face at whatever zoom was needed. Text re-flows as the zoom
      // changes, so the largest zoom that fits is found by halving.
      const have = box.clientHeight;
      body.style.minHeight = '0';
      const fits = (z) => {
        body.style.zoom = String(z);
        return body.getBoundingClientRect().height <= have - 2;
      };
      let z = 1;
      if (have && !fits(1)) {
        let lo = MIN_FIT;
        let hi = 1;
        if (fits(lo)) {
          for (let i = 0; i < 6; i += 1) {
            const mid = (lo + hi) / 2;
            if (fits(mid)) lo = mid;
            else hi = mid;
          }
        }
        // Re-flow is not perfectly smooth, so confirm the pick and step down
        // until it really fits.
        z = Math.floor(lo * 100) / 100;
        while (z > MIN_FIT && !fits(z)) z = Math.max(MIN_FIT, z - 0.02);
      }
      body.style.zoom = String(z);
      body.style.minHeight = `${100 / z}%`;
    };
    fit();
    // System emoji and late layout can shift sizes without a font event, so
    // check again shortly after.
    const timers = [setTimeout(fit, 250), setTimeout(fit, 1200)];
    // Web fonts and emoji can arrive after the first layout and change it.
    const fonts = typeof document !== 'undefined' ? document.fonts : null;
    fonts?.addEventListener?.('loadingdone', fit);
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    watch?.observe(box);
    return () => {
      timers.forEach(clearTimeout);
      fonts?.removeEventListener?.('loadingdone', fit);
      watch?.disconnect();
    };
  }, [visual, source]);

  if (!v) return null;
  const tone = v.tone || '#0F7B6C';
  const Diagram = DIAGRAMS[v.diagram?.type];
  return (
    <div
      ref={outer}
      style={{
        height: '100%',
        borderRadius: 20,
        // Scrolls rather than clips if a card is still too long at MIN_FIT.
        overflowY: 'auto',
        overflowX: 'hidden',
        background: '#fff',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div ref={inner} style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          flexShrink: 0,
          background: `linear-gradient(135deg, ${tone}, ${soft(tone, 0.75)})`,
          color: '#fff',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 54, lineHeight: 1, filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.2))' }} aria-hidden="true">
          {v.emoji}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{v.title}</div>
          {v.tag ? <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>{v.tag}</div> : null}
        </div>
      </div>

      {v.answer ? (
        <div style={{ background: soft(tone, 0.1), borderBottom: `1px solid ${soft(tone, 0.25)}`, padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ color: tone, fontWeight: 900, fontSize: 16, lineHeight: 1.3 }} aria-hidden="true">✓</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: ink, lineHeight: 1.3 }}>{v.answer}</span>
        </div>
      ) : null}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', gap: 14, padding: '14px 16px' }}>
        <div style={{ background: soft(tone, 0.08), border: `2px solid ${soft(tone, 0.5)}`, borderRadius: 16, padding: '12px 14px' }}>
          <Hook text={v.hook} tone={tone} />
        </div>
        {Diagram ? <Diagram {...v.diagram} tone={tone} /> : null}
        {v.trap ? (
          <p style={{ margin: 0, background: '#fdecea', color: '#8a1f17', borderRadius: 12, padding: '8px 10px', fontSize: 13, fontWeight: 600 }}>
            ⚠️ {v.trap}
          </p>
        ) : null}
      </div>
      {source ? (
        <p style={{ margin: 0, flexShrink: 0, padding: '6px 16px 10px', fontSize: 11, color: muted }}>Source: {source}</p>
      ) : null}
      </div>
    </div>
  );
}
