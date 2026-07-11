import { describe, expect, it } from 'vitest';
import {
  isFeedPath,
  isPostPermalinkPath,
  pageKind,
  shouldCaptureUrl,
} from '@/entrypoints/content/gate';

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

describe('isPostPermalinkPath', () => {
  it.each([
    ['/posts/gabrielpichot_je-recrute-share-7480918738314387457-cruf/', true],
    ['/posts/some-slug', true], // no trailing slash
    ['/posts/', false], // no slug
    ['/posts/a/b/', false], // deeper than a single-post permalink
    ['/feed/update/urn:li:activity:1/', false], // update permalink, handled separately
    ['/in/ada-lovelace/', false], // a profile, never captured
    ['/messaging/', false],
    ['/feed/', false],
  ] as const)('isPostPermalinkPath(%s) → %s', (path, expected) => {
    expect(isPostPermalinkPath(path)).toBe(expected);
  });
});

describe('pageKind', () => {
  it('classifies feed, permalink, and off surfaces on linkedin.com', () => {
    expect(pageKind('https://www.linkedin.com/feed/')).toBe('feed');
    expect(pageKind('https://linkedin.com/feed')).toBe('feed');
    expect(pageKind('https://www.linkedin.com/posts/x-share-7480918738314387457-cruf/')).toBe(
      'permalink',
    );
    expect(pageKind('https://www.linkedin.com/in/ada/')).toBeNull();
    expect(pageKind('https://evil.example.com/posts/x-y/')).toBeNull(); // other host
    expect(pageKind('not a url')).toBeNull();
  });
});

describe('shouldCaptureUrl', () => {
  it('is true for the feed and post permalinks only', () => {
    expect(shouldCaptureUrl('https://www.linkedin.com/feed/')).toBe(true);
    expect(shouldCaptureUrl('https://linkedin.com/posts/x-y/')).toBe(true);
    expect(shouldCaptureUrl('https://www.linkedin.com/messaging/')).toBe(false);
    expect(shouldCaptureUrl('https://www.linkedin.com/in/ada/')).toBe(false);
  });
});
