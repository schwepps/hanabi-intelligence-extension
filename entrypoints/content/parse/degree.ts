import type { AuthorDegree } from '@/shared/payload';

/**
 * Map a visible connection-degree badge ("2nd", "· 2nd", "2e", "3rd+") to the contract enum.
 * Absent/unrecognized → 'none' (company pages and the sensor's own posts legitimately have no
 * degree — never invent one). Handles English (1st/2nd/3rd[+]) and French (1er/1re/2e/3e) forms.
 */
export function mapDegree(raw: string | null | undefined): AuthorDegree {
  if (raw == null) return 'none';
  const text = raw.toLowerCase().replace(/[•·]/g, ' ');

  if (/\b1(st|er|re)\b/.test(text)) return 'first';
  if (/\b2(nd|e|eme|ème)\b/.test(text)) return 'second';
  if (/\b3(rd|e|eme|ème)\b\+?/.test(text)) return 'third';

  // Bare degree token, e.g. a badge whose only content is "1" / "2" / "3" / "3+".
  const bare = text.trim();
  if (bare === '1') return 'first';
  if (bare === '2') return 'second';
  if (bare === '3' || bare === '3+') return 'third';

  return 'none';
}
