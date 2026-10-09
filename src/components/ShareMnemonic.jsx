// Shares one mnemonic as a picture — to WhatsApp or anywhere the phone's share
// sheet offers — framed with the app's logo and name so it carries the brand
// wherever it ends up.
//
// The framed card is rendered off screen only while sharing, turned into a
// PNG with html-to-image (the same way results and performance cards are
// shared), and handed to shareImage(), which uses the native share sheet in
// the app and the Web Share API in the browser.
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toPng } from 'html-to-image';
import { Share2 } from 'lucide-react';
import MnemonicVisual, { readVisual } from './MnemonicVisual';
import { shareImage } from '../lib/native';
import { useToast } from './ui';

const APP_NAME = 'Easy Pedia App';
const APP_LINK = 'https://easy-pedia.web.app/download';

/** The picture that gets shared: brand bar, the question, the drawn card. */
export function ShareFrame({ card, frameRef }) {
  const v = readVisual(card.visual);
  const tone = v?.tone || '#0F7B6C';
  return (
    <div
      ref={frameRef}
      style={{
        width: 540,
        background: '#ffffff',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        color: '#17232b',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: '#1976D2', color: '#fff' }}>
        <img src="/img/logo.png" alt="" width="44" height="44" style={{ borderRadius: 12, background: '#fff', padding: 3 }} />
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{APP_NAME}</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>Mnemonics · made by a paediatrician</div>
        </div>
      </div>
      {card.front ? (
        <div style={{ padding: '14px 20px', borderBottom: `3px solid ${tone}`, fontSize: 17, fontWeight: 600, lineHeight: 1.35 }}>
          {card.front}
        </div>
      ) : null}
      <div style={{ height: 640, padding: 12 }}>
        <MnemonicVisual visual={card.visual} source={card.source} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px 14px', fontSize: 13, color: '#5b6b75' }}>
        <span>Learn more on {APP_NAME}</span>
        <span>easy-pedia.web.app</span>
      </div>
    </div>
  );
}

/**
 * A round share button for the corner of a drawn card. It sits inside the
 * card that turns over when tapped, so it stops the tap from reaching it.
 */
export default function ShareMnemonicButton({ card, className = '' }) {
  const toast = useToast();
  const frameRef = useRef(null);
  const [rendering, setRendering] = useState(false);

  const share = async (e) => {
    e.stopPropagation();
    if (rendering) return;
    setRendering(true);
    try {
      // Let the off-screen frame mount and its logo load before capturing.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const img = frameRef.current?.querySelector('img');
      if (img && !img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
      const dataUrl = await toPng(frameRef.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
      const title = readVisual(card.visual)?.title || 'Mnemonic';
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mnemonic';
      await shareImage(dataUrl, `easy-pedia-${slug}.png`, `${title} — a mnemonic from ${APP_NAME}. Get the app: ${APP_LINK}`);
    } catch (err) {
      // Closing the share sheet without picking an app is not an error.
      if (!/cancel|abort/i.test(String(err?.message || err?.name || ''))) {
        toast(err?.message || 'Could not share this mnemonic', 'error');
      }
    } finally {
      setRendering(false);
    }
  };

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label="Share this mnemonic as a picture"
        title="Share (WhatsApp and more)"
        onClick={share}
        onKeyDown={(e) => {
          if (e.key === 'Enter') share(e);
        }}
        className={`rounded-full bg-white/90 p-2 text-slate-700 shadow ${rendering ? 'opacity-50' : ''} ${className}`}
      >
        <Share2 size={18} />
      </span>
      {rendering &&
        createPortal(
          <div style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }} aria-hidden="true">
            <ShareFrame card={card} frameRef={frameRef} />
          </div>,
          document.body,
        )}
    </>
  );
}
