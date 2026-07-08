// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  classifyPostType,
  extractAuthor,
  extractCounts,
  extractHashtags,
  extractText,
} from '@/entrypoints/content/feed/fields';
import { fragment } from '../support/dom';

/** A post whose actor block has an avatar link (no text) + a name-bearing link (real 2026 shape). */
const authorBlock = (href: string, name: string) => `
  <div class="actor">
    <a href="${href}" aria-label="${name}"><img src="https://ex.com/a.jpg" alt="" /></a>
    <a href="${href}"><span>${name}</span></a>
  </div>`;

describe('extractAuthor', () => {
  it('takes the name from the name-bearing link, not the avatar link', () => {
    const post = fragment(
      `<div>${authorBlock('https://www.linkedin.com/in/ada-lovelace/', 'Ada Lovelace')}</div>`,
    );
    expect(extractAuthor(post)).toEqual({
      name: 'Ada Lovelace',
      profile_url: 'https://www.linkedin.com/in/ada-lovelace/',
      type: 'person',
    });
  });

  it('classifies a company page author and strips tracking query', () => {
    const post = fragment(
      `<div>${authorBlock('https://www.linkedin.com/company/globex/?trk=x', 'Globex')}</div>`,
    );
    expect(extractAuthor(post)).toMatchObject({
      name: 'Globex',
      profile_url: 'https://www.linkedin.com/company/globex/',
      type: 'company',
    });
  });

  it('falls back to the avatar aria-label when no link has text', () => {
    const post = fragment(
      '<div><a href="https://www.linkedin.com/in/x/" aria-label="Ada Lovelace"><img alt="" /></a></div>',
    );
    expect(extractAuthor(post).name).toBe('Ada Lovelace');
  });
});

describe('extractText', () => {
  it('reads the expandable text box', () => {
    const post = fragment('<div><div data-testid="expandable-text-box">Hiring a dev</div></div>');
    expect(extractText(post)).toBe('Hiring a dev');
  });
  it('returns null with no text box (media-only post)', () => {
    expect(extractText(fragment('<div><img /></div>'))).toBeNull();
  });
});

describe('extractCounts', () => {
  it('reads reaction and comment counts from resolved aria-labels', () => {
    const post = fragment(`
      <div>
        <button aria-label="1,234 reactions">👍</button>
        <button aria-label="56 comments">💬</button>
      </div>`);
    expect(extractCounts(post)).toEqual({ reaction_count: 1234, comment_count: 56 });
  });
  it('defaults to 0 when counts are absent', () => {
    expect(extractCounts(fragment('<div><button aria-label="Like">👍</button></div>'))).toEqual({
      reaction_count: 0,
      comment_count: 0,
    });
  });
});

describe('classifyPostType', () => {
  it('detects video', () => {
    expect(classifyPostType(fragment('<div><video></video></div>'))).toBe('video');
  });
  it('counts content images, ignoring avatars inside author links', () => {
    const post = fragment(`
      <div>
        <a href="https://www.linkedin.com/in/x/"><img alt="avatar" /></a>
        <img alt="content-1" /><img alt="content-2" />
      </div>`);
    expect(classifyPostType(post)).toBe('multi_image');
  });
  it('single content image → image', () => {
    expect(classifyPostType(fragment('<div><img alt="c" /></div>'))).toBe('image');
  });
  it('no media → text', () => {
    expect(classifyPostType(fragment('<div><p>hello</p></div>'))).toBe('text');
  });
});

describe('extractHashtags', () => {
  it('reads + de-dupes hashtags from the /hashtag/ href', () => {
    const post = fragment(`
      <div>
        <a href="/feed/hashtag/?keywords=react">#react</a>
        <a href="/feed/hashtag/?keywords=hiring">#hiring</a>
        <a href="/feed/hashtag/?keywords=react">#react</a>
      </div>`);
    expect(extractHashtags(post)).toEqual(['react', 'hiring']);
  });
});
