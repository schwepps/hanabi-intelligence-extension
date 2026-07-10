// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  classifyPostType,
  extractAuthor,
  extractAuthorHeadline,
  extractComments,
  extractCounts,
  extractHashtags,
  extractMediaTitle,
  extractPostedAt,
  extractText,
  findResharedCard,
  findSurfaceHeader,
  resolveRepost,
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
      degree: 'none',
    });
  });

  it('reads the connection degree from the name badge and strips it from the name', () => {
    // On the live feed the degree renders as a span INSIDE the name link ("Victor Taki • 2e").
    const post = fragment(
      '<div><a href="https://www.linkedin.com/in/victor/" aria-label="Victor"><img alt="" /></a><a href="https://www.linkedin.com/in/victor/"><span>Victor Taki</span><span> • 2e</span></a></div>',
    );
    expect(extractAuthor(post)).toEqual({
      name: 'Victor Taki',
      profile_url: 'https://www.linkedin.com/in/victor/',
      type: 'person',
      degree: 'second',
    });
  });

  it('treats a "Suivi" (Following) suffix as no degree and still cleans the name', () => {
    const post = fragment(
      '<div><a href="https://www.linkedin.com/in/ola/"><span>Olawale Kolawole</span><span> • Suivi</span></a></div>',
    );
    expect(extractAuthor(post)).toMatchObject({ name: 'Olawale Kolawole', degree: 'none' });
  });

  it('has no degree for a company page author', () => {
    const post = fragment(
      `<div>${authorBlock('https://www.linkedin.com/company/globex/', 'Globex')}</div>`,
    );
    expect(extractAuthor(post).degree).toBe('none');
  });

  it('never derives a degree for a company whose name starts with an ordinal', () => {
    // "2nd Street" would match the degree regex, but a company Page has no connection degree.
    const post = fragment(
      '<div><a href="https://www.linkedin.com/company/2nd-street/"><span>2nd Street</span></a></div>',
    );
    expect(extractAuthor(post)).toMatchObject({ type: 'company', degree: 'none' });
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

describe('extractPostedAt', () => {
  it('reads the relative timestamp, stripping the trailing bullet', () => {
    expect(extractPostedAt(fragment('<div><span>16 h •</span></div>'))).toBe('16 h');
    expect(extractPostedAt(fragment('<div><span>15 min •</span></div>'))).toBe('15 min');
    expect(extractPostedAt(fragment('<div><span>3 j</span></div>'))).toBe('3 j');
  });
  it('keeps an edited post’s time and drops the "Modifié" marker', () => {
    expect(extractPostedAt(fragment('<div><span>5 h • Modifié</span></div>'))).toBe('5 h');
  });
  it('reads English compact times', () => {
    expect(extractPostedAt(fragment('<div><span>2h</span></div>'))).toBe('2h');
    expect(extractPostedAt(fragment('<div><span>3d</span></div>'))).toBe('3d');
  });
  it('does not mistake a headline that starts with a number for a timestamp', () => {
    expect(
      extractPostedAt(fragment('<div><span>5 ans d’expérience en IA</span></div>')),
    ).toBeNull();
  });
  it('ignores timestamps inside comment threads', () => {
    const post = fragment('<div><div data-testid="commentList-x"><span>2 h</span></div></div>');
    expect(extractPostedAt(post)).toBeNull();
  });
  it('ignores a timestamp-like token inside the post body', () => {
    const post = fragment(
      '<div><div data-testid="expandable-text-box"><span>2h</span></div></div>',
    );
    expect(extractPostedAt(post)).toBeNull();
  });
  it('returns null when no timestamp is present', () => {
    expect(extractPostedAt(fragment('<div><span>Lead AI Architect</span></div>'))).toBeNull();
  });
});

/** A post whose actor block (name/headline/time) is nested above the body — the live 2026 shape. */
const actorPost = (name: string, headline: string, time = '16 h •') =>
  fragment(`
    <div>
      <div>
        <a href="https://www.linkedin.com/in/x/"><span>${name}</span></a>
        <span>${headline}</span>
        <span>${time}</span>
      </div>
      <div data-testid="expandable-text-box">building great things at scale every day</div>
    </div>`);

describe('extractAuthorHeadline', () => {
  it('splits "Title at Company"', () => {
    expect(extractAuthorHeadline(actorPost('Ada', 'Founder at Globex'))).toEqual({
      title: 'Founder',
      company: 'Globex',
    });
  });
  it('splits French "Titre chez Société"', () => {
    expect(extractAuthorHeadline(actorPost('Ada', 'Directrice chez Renault'))).toEqual({
      title: 'Directrice',
      company: 'Renault',
    });
  });
  it('splits "Role @ Company"', () => {
    expect(extractAuthorHeadline(actorPost('Ada', 'CEO @ Acme'))).toEqual({
      title: 'CEO',
      company: 'Acme',
    });
  });
  it('uses only the first headline segment (drops trailing | tagline noise)', () => {
    expect(
      extractAuthorHeadline(actorPost('Ada', 'Founder at ThirstySprout | ChoppingBlock.ai | AI')),
    ).toEqual({ title: 'Founder', company: 'ThirstySprout' });
  });
  it('returns nulls for a headline with no company delimiter, and never reads the post body', () => {
    // body contains "at scale" but must be ignored (out of the actor block)
    expect(extractAuthorHeadline(actorPost('Ada', 'Lead AI Architect'))).toEqual({
      title: null,
      company: null,
    });
  });
});

describe('classifyPostType', () => {
  it('detects video (the one reliable structural marker)', () => {
    expect(classifyPostType(fragment('<div><video></video></div>'))).toBe('video');
  });
  it('detects a document post via the page-navigation control', () => {
    const post = fragment(
      '<div><button aria-label="Aller à la page suivante du document"></button><button aria-label="Page 1 sur 8"></button></div>',
    );
    expect(classifyPostType(post)).toBe('document');
  });
  it('detects a shared native article via a standalone /pulse/ card link', () => {
    const post = fragment(
      '<div><a href="https://www.linkedin.com/pulse/foo/"><span>Article card</span></a><div data-testid="expandable-text-box">body</div></div>',
    );
    expect(classifyPostType(post)).toBe('article');
  });
  it('does NOT treat a /pulse/ link inside the body text as an article share', () => {
    const post = fragment(
      '<div><div data-testid="expandable-text-box">read <a href="https://www.linkedin.com/pulse/foo/">my article</a></div></div>',
    );
    expect(classifyPostType(post)).toBe('text');
  });
  it('conservatively returns text for images/carousels (permanent-mistype risk; no reliable anchor)', () => {
    expect(classifyPostType(fragment('<div><img alt="c1" /><img alt="c2" /></div>'))).toBe('text');
    expect(classifyPostType(fragment('<div><p>hello</p></div>'))).toBe('text');
  });
  it('does not treat role=radio as a poll (it is noise across unrelated posts on the live feed)', () => {
    const post = fragment('<div><div role="radio"></div><div role="radio"></div></div>');
    expect(classifyPostType(post)).toBe('text');
  });
});

describe('extractMediaTitle', () => {
  it('reads the document title from the "title · N pages" badge', () => {
    const post = fragment(
      '<div><div><span>n8n et Claude</span><span>·</span><span>8 pages</span></div></div>',
    );
    expect(extractMediaTitle(post, 'document')).toBe('n8n et Claude');
  });
  it('returns null for a text post even if a "N pages" string appears elsewhere', () => {
    expect(
      extractMediaTitle(fragment('<div><span>whatever · 8 pages</span></div>'), 'text'),
    ).toBeNull();
  });
  it('returns null when no document title badge is present', () => {
    expect(extractMediaTitle(fragment('<div><span>hello</span></div>'), 'document')).toBeNull();
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

/** A plain reshare ("X a republié ceci"): the original post renders below the resharer verb-line. */
const resharePost = () =>
  fragment(`
    <div>
      <div><a href="https://www.linkedin.com/in/rey/">Rey Resharer</a> a republié ceci</div>
      <div>
        <a href="https://www.linkedin.com/in/grace/" aria-label="Grace"><img alt="" /></a>
        <a href="https://www.linkedin.com/in/grace/"><span>Grace Hopper</span></a>
      </div>
      <div data-testid="expandable-text-box">original post body</div>
    </div>`);

describe('resolveRepost', () => {
  it('attributes a plain reshare to the original author (the poster below the header), not the resharer', () => {
    const post = resharePost();
    const header = findSurfaceHeader(post);
    const author = extractAuthor(post, header?.el);
    expect(resolveRepost(post, header, author)).toEqual({
      is_repost: true,
      original_author_name: 'Grace Hopper',
      original_author_profile_url: 'https://www.linkedin.com/in/grace/',
    });
  });

  it('is not a repost when there is no repost header', () => {
    const post = surfacedPost(); // engagement header, not a reshare
    const header = findSurfaceHeader(post);
    const author = extractAuthor(post, header?.el);
    expect(resolveRepost(post, header, author)).toEqual({
      is_repost: false,
      original_author_name: null,
      original_author_profile_url: null,
    });
  });

  it('downgrades to non-repost when the original author cannot be resolved (never resharer-less)', () => {
    const post = fragment(
      '<div><span>Quelqu\'un a republié ceci</span><div data-testid="expandable-text-box">body, no author link</div></div>',
    );
    const header = findSurfaceHeader(post);
    const author = extractAuthor(post, header?.el);
    expect(header?.kind).toBe('repost');
    expect(author.name).toBeNull();
    expect(resolveRepost(post, header, author)).toEqual({
      is_repost: false,
      original_author_name: null,
      original_author_profile_url: null,
    });
  });
});

/**
 * A quote-repost (reshare-with-thoughts): resharer actor + commentary on top, then a nested embedded
 * card holding the original author + a link to the original update. Mirrors the live DOM validated on
 * a real reshare (outer author = resharer; original author = the company inside the embedded card).
 */
const quoteRepost = () =>
  fragment(`
    <div>
      <a href="https://www.linkedin.com/in/rey/" aria-label="Rey"><img alt="" /></a>
      <a href="https://www.linkedin.com/in/rey/"><span>Rey Resharer</span></a>
      <div data-testid="expandable-text-box">Merci pour cet outil !</div>
      <div class="reshared-card">
        <a href="https://www.linkedin.com/company/acme/" aria-label="Acme"><img alt="" /></a>
        <a href="https://www.linkedin.com/company/acme/"><span>Acme Corp</span></a>
        <a href="https://www.linkedin.com/feed/update/urn:li:share:123/"><div data-testid="expandable-text-box">Original body</div></a>
      </div>
    </div>`);

describe('findResharedCard + quote-repost provenance', () => {
  it('finds the embedded reshared card via its /feed/update/ link', () => {
    const card = findResharedCard(quoteRepost());
    expect(card).not.toBeNull();
    // the card holds the original author, not the resharer
    expect(card?.querySelector('a[href*="/company/acme/"]')).not.toBeNull();
    expect(card?.querySelector('a[href*="/in/rey/"]')).toBeNull();
  });

  it('returns null for a post with no embedded reshared card', () => {
    expect(findResharedCard(resharePost())).toBeNull();
    expect(
      findResharedCard(fragment('<div><a href="https://www.linkedin.com/in/x/">X</a></div>')),
    ).toBeNull();
  });

  it('attributes a quote-repost to the embedded original author, not the resharer', () => {
    const post = quoteRepost();
    const header = findSurfaceHeader(post);
    const author = extractAuthor(post, header?.el);
    expect(author.name).toBe('Rey Resharer'); // outer author is the resharer
    expect(resolveRepost(post, header, author)).toEqual({
      is_repost: true,
      original_author_name: 'Acme Corp',
      original_author_profile_url: 'https://www.linkedin.com/company/acme/',
    });
  });

  it('returns null (not a repost) when the update link has no actor-bearing ancestor below the post', () => {
    // a non-reshare post that merely links to another update — the link climbs straight to `post`
    const post = fragment(
      '<div><a href="https://www.linkedin.com/in/dave/"><span>Dave</span></a><div data-testid="expandable-text-box">see this</div><a href="https://www.linkedin.com/feed/update/urn:li:activity:999/">link</a></div>',
    );
    expect(findResharedCard(post)).toBeNull();
    const header = findSurfaceHeader(post);
    expect(resolveRepost(post, header, extractAuthor(post, header?.el))).toEqual({
      is_repost: false,
      original_author_name: null,
      original_author_profile_url: null,
    });
  });

  it('ignores a /feed/update/ link inside a preview comment (no false repost)', () => {
    const post = fragment(`
      <div>
        <a href="https://www.linkedin.com/in/dave/"><span>Dave</span></a>
        <div data-testid="expandable-text-box">my post</div>
        <div data-testid="commentList-XYZ">
          <div><a href="https://www.linkedin.com/in/carol/"><span>Carol</span></a><a href="https://www.linkedin.com/feed/update/urn:li:activity:5/"><div data-testid="expandable-text-box">nice</div></a></div>
        </div>
      </div>`);
    expect(findResharedCard(post)).toBeNull();
  });

  it('downgrades when the reshared card resolves back to the resharer (never attribute to resharer)', () => {
    // the update link's nearest actor-bearing ancestor holds the SAME (outer) author
    const post = fragment(
      '<div><div><a href="https://www.linkedin.com/in/dave/"><span>Dave</span></a><div data-testid="expandable-text-box">thoughts</div><a href="https://www.linkedin.com/feed/update/urn:li:activity:9/">link</a></div></div>',
    );
    const header = findSurfaceHeader(post);
    const author = extractAuthor(post, header?.el);
    expect(findResharedCard(post)).not.toBeNull(); // the card is found...
    expect(resolveRepost(post, header, author)).toEqual({
      is_repost: false, // ...but it resolves to the resharer, so we downgrade
      original_author_name: null,
      original_author_profile_url: null,
    });
  });

  it('downgrades when the embedded card has no resolvable original author', () => {
    const post = fragment(`
      <div>
        <a href="https://www.linkedin.com/in/rey/"><span>Rey Resharer</span></a>
        <div data-testid="expandable-text-box">thoughts</div>
        <div>
          <a href="https://www.linkedin.com/company/acme/"><img alt="" /></a>
          <a href="https://www.linkedin.com/feed/update/urn:li:share:1/"><div data-testid="expandable-text-box">body</div></a>
        </div>
      </div>`);
    const header = findSurfaceHeader(post);
    const author = extractAuthor(post, header?.el);
    expect(findResharedCard(post)).not.toBeNull();
    expect(resolveRepost(post, header, author)).toMatchObject({ is_repost: false });
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
