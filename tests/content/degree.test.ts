import { describe, expect, it } from 'vitest';
import { mapDegree } from '@/entrypoints/content/parse/degree';

describe('mapDegree', () => {
  it.each([
    ['1st', 'first'],
    ['• 1st', 'first'],
    ['1er', 'first'],
    ['1re', 'first'],
    ['2nd', 'second'],
    ['· 2nd', 'second'],
    ['2e', 'second'],
    ['3rd', 'third'],
    ['3rd+', 'third'],
    ['3e', 'third'],
    ['1', 'first'],
    ['2', 'second'],
    ['3', 'third'],
    ['3+', 'third'],
    ['Following', 'none'],
    ['', 'none'],
    [null, 'none'],
    [undefined, 'none'],
  ] as const)('mapDegree(%o) → %s', (input, expected) => {
    expect(mapDegree(input)).toBe(expected);
  });
});
