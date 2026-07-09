import { describe, expect, it } from 'vitest';
import { isLinkedInHost, isLinkedInUrl } from '@/shared/linkedin-url';

describe('isLinkedInHost', () => {
  it.each([
    ['linkedin.com', true],
    ['www.linkedin.com', true],
    ['sub.linkedin.com', true],
    ['LINKEDIN.COM', true],
    ['evillinkedin.com', false], // lookalike prefix — the endsWith bug
    ['linkedin.com.evil.co', false], // lookalike suffix
    ['notlinkedin.com', false],
    ['example.com', false],
  ])('isLinkedInHost(%s) → %s', (host, expected) => {
    expect(isLinkedInHost(host)).toBe(expected);
  });
});

describe('isLinkedInUrl', () => {
  it('accepts linkedin urls, rejects lookalikes and non-strings', () => {
    expect(isLinkedInUrl('https://www.linkedin.com/in/ada/')).toBe(true);
    expect(isLinkedInUrl('https://evillinkedin.com/in/x')).toBe(false);
    expect(isLinkedInUrl('not a url')).toBe(false);
    expect(isLinkedInUrl(null)).toBe(false);
  });
});
