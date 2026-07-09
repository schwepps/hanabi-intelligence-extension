/**
 * Parse a LinkedIn engagement count into a number.
 *
 * LinkedIn renders counts as localized VISIBLE TEXT ("1 234 réactions", "1.2K"); the caller
 * (extractCounts) passes those strings here. Returns `null` when no digits are present (absence ≠
 * zero — the caller decides the 0-vs-null policy per field).
 *
 * Strategy: take the FIRST numeric run (digits + grouping separators — `,` `.` any whitespace incl.
 * NBSP, apostrophe). If a multiplier letter (k/m/b + locale variants) immediately follows, treat
 * the number as a decimal and scale it; otherwise it's a grouped integer and any trailing word
 * (e.g. "réactions", "comments") is ignored.
 */
const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  tsd: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  mio: 1_000_000,
  b: 1_000_000_000,
  mrd: 1_000_000_000,
};

export function parseLocalizedCount(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const text = raw.trim().toLowerCase();

  const numMatch = text.match(/\d[\d.,\s']*/);
  if (!numMatch) return null;
  const numToken = numMatch[0];

  const after = text.slice((numMatch.index ?? 0) + numToken.length);
  const multKey = after.match(/^\s*(k|tsd|m|mn|mio|b|mrd)\b/)?.[1];
  const multiplier = multKey ? MULTIPLIERS[multKey] : undefined;

  if (multiplier != null) {
    const normalized = numToken.replace(/[\s']/g, '').replace(',', '.');
    const value = Number.parseFloat(normalized);
    return Number.isNaN(value) ? null : Math.round(value * multiplier);
  }

  const digits = numToken.replace(/\D/g, '');
  if (digits === '') return null;
  const value = Number.parseInt(digits, 10);
  return Number.isNaN(value) ? null : value;
}
