import { describe, expect, it } from 'vitest';
import { parseLocalizedCount } from '@/entrypoints/content/parse/number';

describe('parseLocalizedCount', () => {
  it.each<[string | null | undefined, number | null]>([
    // plain + grouped integers across locales
    ['5', 5],
    ['12', 12],
    ['1,234', 1234],
    ['1.234', 1234], // German thousands
    ['1 234', 1234], // ASCII space grouping
    ['1 234', 1234], // NBSP grouping
    ['1 234', 1234], // narrow NBSP grouping
    ["1'234", 1234], // Swiss apostrophe grouping
    // abbreviated with multiplier + decimal
    ['1.2K', 1200],
    ['1,2K', 1200],
    ['1,2 k', 1200],
    ['12 K', 12000],
    ['3,4 M', 3_400_000],
    ['2B', 2_000_000_000],
    ['3,4 Tsd.', 3400], // German thousands abbreviation
    // exact aria-label form ("<int> <word>") — trailing word ignored
    ['1,234 reactions', 1234],
    ['12 comments', 12],
    ['1.2K reactions', 1200], // abbreviation + trailing word
    ['1 234 réactions', 1234], // French grouped integer + accented word
    // absence → null (never 0)
    ['', null],
    ['—', null], // em dash
    ['No reactions', null],
    [null, null],
    [undefined, null],
  ])('parseLocalizedCount(%o) → %o', (input, expected) => {
    expect(parseLocalizedCount(input)).toBe(expected);
  });
});
