import { describe, expect, it } from 'vitest';
import { isFeedPath, isFeedUrl } from '@/entrypoints/content/gate';

describe('isFeedPath', () => {
  it.each([
    ['/feed', true],
    ['/feed/', true],
    ['/feed/update/urn:li:activity:1/', false], // single-post permalink, not the scrolling feed
    ['/feed/following/', false],
    ['/messaging/', false],
    ['/notifications/', false],
    ['/in/ada-lovelace/', false],
    ['/company/globex/', false],
    ['/mynetwork/', false],
    ['/', false],
  ] as const)('isFeedPath(%s) → %s', (path, expected) => {
    expect(isFeedPath(path)).toBe(expected);
  });
});

describe('isFeedUrl', () => {
  it('accepts the home feed on linkedin.com and www.linkedin.com', () => {
    expect(isFeedUrl('https://www.linkedin.com/feed/')).toBe(true);
    expect(isFeedUrl('https://linkedin.com/feed')).toBe(true);
    expect(isFeedUrl('https://www.linkedin.com/feed/?trk=x')).toBe(true); // query ignored
  });

  it('rejects private surfaces and other hosts', () => {
    expect(isFeedUrl('https://www.linkedin.com/messaging/')).toBe(false);
    expect(isFeedUrl('https://www.linkedin.com/notifications/')).toBe(false);
    expect(isFeedUrl('https://evil.example.com/feed/')).toBe(false);
    expect(isFeedUrl('not a url')).toBe(false);
  });
});
