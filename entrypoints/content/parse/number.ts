/**
 * Parse a LinkedIn engagement count into a number.
 *
 * LinkedIn renders counts in many locale/abbreviation forms; callers should prefer the exact
 * integer from an `aria-label` ("1,234 reactions") and fall back to the abbreviated visible text
 * ("1.2K"). Returns `null` when no digits are present (absence ≠ zero — the caller decides the
 * 0-vs-null policy per field).
 *
 * Handled: grouping separators (`,` `.` and any Unicode whitespace incl. NBSP / narrow NBSP, which
 * JS `\s` matches; plus apostrophe) and K/M/B (+ locale variants mn/mio/mrd) with a decimal part.
 */
const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  mio: 1_000_000,
  b: 1_000_000_000,
  mrd: 1_000_000_000,
};

export function parseLocalizedCount(raw: string | null | undefined): number | null {
  if (raw == null) return null;

  // Numeric token (digits + grouping/decimal separators) plus an optional letter suffix (K/M/B…).
  const match = raw
    .trim()
    .toLowerCase()
    .match(/([\d.,\s']+?)\s*([a-z]+)?$/);
  if (!match) return null;

  const numberPart = match[1];
  if (numberPart == null) return null;
  const suffix = match[2] ?? '';
  const multiplier = MULTIPLIERS[suffix];

  if (multiplier != null) {
    // Abbreviated form: the numeric part is a small decimal ("1,2" / "1.2" → 1.2).
    const normalized = numberPart.replace(/[\s']/g, '').replace(',', '.');
    const value = Number.parseFloat(normalized);
    return Number.isNaN(value) ? null : Math.round(value * multiplier);
  }

  // Full integer with grouping separators — strip everything that isn't a digit.
  const digits = numberPart.replace(/\D/g, '');
  if (digits === '') return null;
  const value = Number.parseInt(digits, 10);
  return Number.isNaN(value) ? null : value;
}
