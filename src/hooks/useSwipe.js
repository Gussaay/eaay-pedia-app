// Horizontal swipe gestures on an element, for moving between questions.
//
// The decision itself lives in ../lib/swipe.js so it can be tested; this hook
// only deals with the listeners.
import { useEffect, useRef } from 'react';
import { decideSwipe } from '../lib/swipe';

/**
 * @param ref       the element to watch
 * @param onForward called for a leftward swipe
 * @param onBack    called for a rightward swipe
 * @param enabled   false while a dialog is open, so the page behind it stays put
 */
export function useSwipe(ref, { onForward, onBack, enabled = true } = {}) {
  // Handlers are usually inline arrows and change on every render. Parking them
  // in a ref keeps the effect from detaching and reattaching listeners
  // constantly, which would drop a gesture that spans a re-render.
  const handlers = useRef({ onForward, onBack });
  handlers.current = { onForward, onBack };

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;

    let start = null;

    const onStart = (e) => {
      // Two fingers means a pinch-zoom on an image, not a swipe. Anything
      // marked data-no-swipe wants the gesture for itself.
      if (e.touches.length !== 1 || e.target?.closest?.('[data-no-swipe]')) {
        start = null;
        return;
      }
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, at: Date.now() };
    };

    const onEnd = (e) => {
      const from = start;
      start = null;
      const t = e.changedTouches?.[0];
      if (!from || !t) return;
      const dir = decideSwipe({
        dx: t.clientX - from.x,
        dy: t.clientY - from.y,
        dt: Date.now() - from.at,
      });
      if (dir === 'forward') handlers.current.onForward?.();
      else if (dir === 'back') handlers.current.onBack?.();
    };

    const cancel = () => {
      start = null;
    };

    // Passive: the gesture is only ever read, never used to block scrolling.
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', cancel);
    };
  }, [ref, enabled]);
}
