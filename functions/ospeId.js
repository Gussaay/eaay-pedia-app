// The id of an OSPE card: the same picture always gives the same id, so one
// picture is one card. Kept apart from ospeCore.js because it needs node:crypto;
// the app imports only ospeCore.js (no crypto), the functions and scripts use this.
import { createHash } from 'node:crypto';
import { normalizeImgUrl } from './ospeCore.js';

/** First 16 hex chars of the sha1 of the normalised url; '' for an empty url. */
export function ospeId(url) {
  const norm = normalizeImgUrl(url);
  return norm ? createHash('sha1').update(norm).digest('hex').slice(0, 16) : '';
}
