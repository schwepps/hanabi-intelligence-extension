import type { AuthorDegree } from '@/shared/payload';

/**
 * Parse an author's connection degree from the actor-block text LinkedIn renders next to the name.
 *
 * On the live feed the degree shows as a small suffix on the poster's name — FR "Victor Taki • 2e",
 * "• 1er", "• 3e et +"; EN "• 2nd", "• 3rd+"; also embedded in accessibility strings ("1st degree
 * connection", "1er niveau de relation"). A non-connection you merely follow shows "• Suivi"
 * (Following) — no degree — and company/school Pages have none. This reads only the RENDERED badge
 * text; the sensor's connection list is never enumerated (guardrail).
 *
 * Strategy: match a leading ordinal 1/2/3 followed by a FR/EN ordinal suffix (+ optional "+"),
 * bounded by a separator so a digit inside a name/headline never matches ("3M", "Top 10", "10e").
 * "3rd+"/"3e et +" (3rd degree and beyond) map to `third` — the enum has no higher bucket.
 * Returns `none` when no badge is present.
 */
const DEGREE_TOKEN = /(?:^|[\s·•|(])([123])(?:er|re|ère|ème|nd|rd|st|e)\+?(?=[\s·•|)]|$)/i;

export function parseAuthorDegree(text: string | null | undefined): AuthorDegree {
  if (!text) return 'none';
  const digit = DEGREE_TOKEN.exec(text)?.[1];
  return digit === '1' ? 'first' : digit === '2' ? 'second' : digit === '3' ? 'third' : 'none';
}
