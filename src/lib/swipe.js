// Deciding whether a touch gesture was a horizontal swipe.
//
// Pure logic (no React, no DOM) so it can be unit-tested: npm test.
//
// The question area scrolls vertically, so distance alone is not enough. A
// gesture only counts as a swipe when it travels far enough sideways AND stays
// clearly more horizontal than vertical. Without that second test every
// slightly slanted scroll would flip the question, which feels like the app is
// fighting the reader.

/** Horizontal travel, in pixels, before a drag counts at all. */
export const MIN_DISTANCE = 60;

/** |dy| may not exceed this share of |dx| — keeps slanted scrolls out. */
export const MAX_SLOPE = 0.6;

/** A slow drag is someone reading, not someone swiping. */
export const MAX_DURATION = 800;

/**
 * @param dx  pixels moved horizontally (negative = leftwards)
 * @param dy  pixels moved vertically
 * @param dt  milliseconds the gesture took
 * @returns 'forward' | 'back' | null
 */
export function decideSwipe({ dx, dy, dt } = {}) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Number.isFinite(dt) && dt > MAX_DURATION) return null;
  if (Math.abs(dx) < MIN_DISTANCE) return null;
  if (Math.abs(dy) > Math.abs(dx) * MAX_SLOPE) return null;
  // Dragging the content leftwards pulls the next question into view, which is
  // the direction every card stack and photo gallery already uses.
  return dx < 0 ? 'forward' : 'back';
}
