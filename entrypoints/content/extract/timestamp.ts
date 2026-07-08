import { cleanText, queryFirst } from '../dom';
import { TIMESTAMP_SELECTORS } from '../selectors';

/**
 * The relative timestamp string LinkedIn shows ("2h", "1d", "3 mo"), captured verbatim. Strips the
 * "Edited" marker and anything after the first separator (visibility icon / "Public"), and returns
 * null when the slot holds a non-time marker. The backend derives the date from this + captured_at.
 */
export function extractTimestamp(scope: Element): string | null {
  const raw = cleanText(queryFirst(scope, TIMESTAMP_SELECTORS)?.textContent);
  if (!raw) return null;

  // Strip the "Edited" marker anywhere (some layouts render it before the time), then take the
  // first non-empty separator-delimited segment.
  const stripped = raw.replace(/\b(edited|modifié|modifie)\b/gi, '');
  for (const segment of stripped.split(/[•·|]/)) {
    const token = cleanText(segment);
    if (!token) continue;
    if (/promoted|sponsored|sponsoris|suggested|suggér/i.test(token)) return null;
    return token;
  }
  return null;
}
