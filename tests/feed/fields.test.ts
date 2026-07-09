// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  classifyPostType,
  extractAuthor,
  extractComments,
  extractCounts,
  extractHashtags,
  extractText,
  findSurfaceHeader,
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

  it('classifies a school Page author as an organization (company)', () => {
    const post = fragment(
      `<div>${authorBlock('https://www.linkedin.com/school/mit/', 'MIT')}</div>`,
    );
    expect(extractAuthor(post)).toMatchObject({ name: 'MIT', type: 'company' });
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
  it('reads localized (French) counts from visible text', () => {
    const post = fragment(`
      <div>
        <span>1 234 réactions</span>
        <button><span>56 commentaires</span></button>
      </div>`);
    expect(extractCounts(post)).toEqual({ reaction_count: 1234, comment_count: 56 });
  });
  it('reads English counts too', () => {
    const post = fragment('<div><span>1,234 reactions</span><a>56 comments</a></div>');
    expect(extractCounts(post)).toEqual({ reaction_count: 1234, comment_count: 56 });
  });
  it('ignores counts inside embedded comment threads', () => {
    const post = fragment(`
      <div>
        <span>10 réactions</span>
        <div data-testid="commentList-abc"><span>999 réactions</span></div>
      </div>`);
    expect(extractCounts(post).reaction_count).toBe(10);
  });
  it('defaults to 0 when counts are absent', () => {
    expect(extractCounts(fragment('<div><span>Aimer</span></div>'))).toEqual({
      reaction_count: 0,
      comment_count: 0,
    });
  });
});

describe('classifyPostType', () => {
  it('detects video (the one reliable structural marker)', () => {
    expect(classifyPostType(fragment('<div><video></video></div>'))).toBe('video');
  });
  it('conservatively returns text for non-video (image typing is a documented gap)', () => {
    expect(classifyPostType(fragment('<div><img alt="c1" /><img alt="c2" /></div>'))).toBe('text');
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

const surfacedPost = () =>
  fragment(`
    <div>
      <div><a href="https://www.linkedin.com/in/connie/">Connie Nection</a> a aimé ceci</div>
      <div>
        <a href="https://www.linkedin.com/in/ada/" aria-label="Ada"><img alt="" /></a>
        <a href="https://www.linkedin.com/in/ada/"><span>Ada Lovelace</span></a>
      </div>
      <div data-testid="expandable-text-box">post body</div>
    </div>`);

describe('findSurfaceHeader + social proof', () => {
  it('detects an engagement (social-proof) header and its connection name', () => {
    const header = findSurfaceHeader(surfacedPost());
    expect(header?.kind).toBe('engagement');
    expect(header?.name).toBe('Connie Nection');
  });

  it('attributes the author to the poster, not the surfacing connection', () => {
    const post = surfacedPost();
    const header = findSurfaceHeader(post);
    expect(extractAuthor(post, header?.el).name).toBe('Ada Lovelace');
  });

  it('detects a repost header', () => {
    const repost = fragment(
      '<div><div><a href="https://www.linkedin.com/in/bob/">Bob</a> a republié ceci</div><div data-testid="expandable-text-box">x</div></div>',
    );
    expect(findSurfaceHeader(repost)?.kind).toBe('repost');
  });

  it('returns null for a plain authored post', () => {
    const plain = fragment(
      '<div><a href="https://www.linkedin.com/in/x/">X</a><div data-testid="expandable-text-box">hello</div></div>',
    );
    expect(findSurfaceHeader(plain)).toBeNull();
  });
});

describe('extractComments', () => {
  it('extracts commenter identity + text from the comment thread', () => {
    const post = fragment(`
      <div>
        <a href="https://www.linkedin.com/in/ada/"><span>Ada</span></a>
        <div data-testid="expandable-text-box">post body</div>
        <div data-testid="commentList-XYZ">
          <div><a href="https://www.linkedin.com/in/carol/"><span>Carol · 2e</span></a><div data-testid="expandable-text-box">Great post!</div></div>
          <div><a href="https://www.linkedin.com/in/dave/"><span>Dave</span></a><div data-testid="expandable-text-box">Agreed</div></div>
        </div>
      </div>`);
    const comments = extractComments(post);
    expect(comments).toHaveLength(2);
    expect(comments[0]).toEqual({
      author_name: 'Carol',
      author_profile_url: 'https://www.linkedin.com/in/carol/',
      text: 'Great post!',
    });
    expect(comments[1]?.author_name).toBe('Dave');
  });

  it('returns [] when there are no comments', () => {
    expect(
      extractComments(fragment('<div><div data-testid="expandable-text-box">body</div></div>')),
    ).toEqual([]);
  });
});
