import { describe, expect, it } from 'vitest';
import type { AuthorDegree } from '@/shared/payload';
import { parseAuthorDegree } from '@/entrypoints/content/parse/degree';

describe('parseAuthorDegree', () => {
  it.each<[string | null | undefined, AuthorDegree]>([
    // French ordinals as rendered on the live feed ("Name • <degree>")
    ['Victor Taki • 2e', 'second'],
    ['Thibault Patrouillat • 1er', 'first'],
    ['• 1re', 'first'], // feminine 1st
    ['• 2ème', 'second'],
    ['Krish Ramineni • 3e et +', 'third'], // 3rd degree "and beyond"
    ['• 3e+', 'third'],
    // English ordinals
    ['Ada Lovelace • 1st', 'first'],
    ['• 2nd', 'second'],
    ['• 3rd', 'third'],
    ['• 3rd+', 'third'],
    // long-form (accessibility) strings still carry the token
    ['1st degree connection', 'first'],
    ['1er niveau de relation', 'first'],
    // no badge → none
    ['Olawale Kolawole • Suivi', 'none'], // "Following", not a connection
    ['keenest 🌈', 'none'],
    ['Ada Lovelace', 'none'],
    ['Thales', 'none'], // company page, no degree
    // must NOT false-match digits embedded in names/headlines
    ['3M Company', 'none'],
    ['Top 10 Voice', 'none'],
    ['10e édition', 'none'], // 10th, not a connection degree
    // absence
    ['', 'none'],
    [null, 'none'],
    [undefined, 'none'],
  ])('parseAuthorDegree(%o) → %o', (input, expected) => {
    expect(parseAuthorDegree(input)).toBe(expected);
  });
});
