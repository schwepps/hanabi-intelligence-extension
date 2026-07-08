// @vitest-environment happy-dom
//
// Phase B extraction logic, exercised against SYNTHETIC fixtures modelling LinkedIn's known DOM
// families. These validate the interpretation (surface classifier, post_type, counts, degree,
// author/hashtag parsing) — NOT that the selectors match the live 2026 feed. Real anonymized
// fixtures + selector confirmation come with the browser recon (see selectors.ts banner).
import { describe, expect, it } from 'vitest';
import { assemblePost } from '@/entrypoints/content/extract';
import { classifySurface } from '@/entrypoints/content/extract/repost';
import { classifyPostType } from '@/entrypoints/content/extract/content';
import { extractTimestamp } from '@/entrypoints/content/extract/timestamp';
import { FIELD_DEFAULTS, REQUIRED_FIELDS } from '@/shared/payload';
import { fragment } from '../support/dom';

const NOW = '2026-07-08T12:00:00.000Z';
const ctx = { now: () => NOW };

const actor = (opts: {
  href: string;
  name: string;
  title?: string;
  sub?: string;
  degree?: string;
}): string => `
  <div class="update-components-actor">
    <a class="update-components-actor__meta" href="${opts.href}">
      <span class="update-components-actor__title"><span aria-hidden="true">${opts.name}</span></span>
      ${opts.title ? `<span class="update-components-actor__description">${opts.title}</span>` : ''}
      <span class="update-components-actor__sub-description">${opts.sub ?? '2h'}</span>
    </a>
    ${opts.degree ? `<span class="update-components-actor__supplementary-actor-info">${opts.degree}</span>` : ''}
  </div>`;

const counts = (reactionAria: string, reactionText: string, commentAria: string): string => `
  <div class="social-details-social-counts">
    <span class="social-details-social-counts__reactions-count" aria-label="${reactionAria}">${reactionText}</span>
    <button aria-label="${commentAria}">${commentAria}</button>
  </div>`;

const post = (urn: string, inner: string): string =>
  `<div class="feed-shared-update-v2" data-urn="${urn}">${inner}</div>`;

describe('assemblePost — plain authored post', () => {
  const html = post(
    'urn:li:activity:1001',
    actor({
      href: 'https://www.linkedin.com/in/ada-lovelace/?trk=abc',
      name: 'Ada Lovelace',
      title: 'CTO at Globex Corp · Building things',
      sub: '2h • Edited',
      degree: '• 2nd',
    }) +
      `<div class="update-components-text">We are hiring a <a href="https://www.linkedin.com/feed/hashtag/?keywords=react">#react</a> engineer!</div>` +
      counts('1,234 reactions', '1.2K', '45 comments'),
  );

  it('extracts author, degree, counts, hashtags, timestamp', () => {
    const p = assemblePost(fragment(html), ctx);
    expect(p).toMatchObject({
      linkedin_post_id: 'urn:li:activity:1001',
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:1001/',
      captured_at: NOW,
      author_name: 'Ada Lovelace',
      author_profile_url: 'https://www.linkedin.com/in/ada-lovelace/',
      author_type: 'person',
      author_title: 'CTO at Globex Corp · Building things',
      author_company: 'Globex Corp',
      author_degree: 'second',
      post_type: 'text',
      is_repost: false,
      social_proof: null,
      hashtags: ['react'],
      reaction_count: 1234, // exact aria-label integer preferred over "1.2K"
      comment_count: 45,
      posted_at_raw: '2h',
    });
  });

  it('honors contract defaults + required fields for a bare post', () => {
    const bare = assemblePost(fragment(post('urn:li:activity:1', '<div>x</div>')), ctx);
    expect(bare).not.toBeNull();
    for (const key of REQUIRED_FIELDS) expect(bare?.[key]).toBeTruthy();
    expect(bare).toMatchObject({
      author_type: FIELD_DEFAULTS.author_type,
      post_type: FIELD_DEFAULTS.post_type,
      is_repost: FIELD_DEFAULTS.is_repost,
      author_degree: FIELD_DEFAULTS.author_degree,
      reaction_count: 0,
      comment_count: 0,
      author_name: null,
      hashtags: [],
    });
  });
});

describe('assemblePost — reposts (original-author provenance)', () => {
  it('quote repost: author = resharer, original = inner author, post_type from inner media', () => {
    const html = post(
      'urn:li:activity:2001',
      actor({
        href: 'https://www.linkedin.com/in/resharer-rick/',
        name: 'Rick Resharer',
        sub: '5h',
      }) +
        `<div class="update-components-text">Great opportunity! 👇</div>` +
        `<div class="update-components-mini-update-v2" data-urn="urn:li:activity:2002">
          ${actor({ href: 'https://www.linkedin.com/in/orig-olivia/', name: 'Olivia Original' })}
          <div class="update-components-text">We are hiring!</div>
          <div class="update-components-image"><img src="https://example.com/a.png" /></div>
        </div>`,
    );
    const p = assemblePost(fragment(html), ctx);
    expect(p).toMatchObject({
      is_repost: true,
      author_name: 'Rick Resharer',
      original_author_name: 'Olivia Original',
      original_author_profile_url: 'https://www.linkedin.com/in/orig-olivia/',
      text: 'Great opportunity! 👇',
      post_type: 'image',
    });
  });

  it('plain repost ("X reposted this"): author = original = the body actor', () => {
    const html = post(
      'urn:li:activity:3001',
      `<div class="update-components-header">Rick Resharer reposted this</div>` +
        actor({
          href: 'https://www.linkedin.com/in/orig-olivia/',
          name: 'Olivia Original',
          sub: '1d',
        }) +
        `<div class="update-components-text">Original body</div>`,
    );
    const p = assemblePost(fragment(html), ctx);
    expect(p).toMatchObject({
      is_repost: true,
      author_name: 'Olivia Original',
      original_author_name: 'Olivia Original',
      original_author_profile_url: 'https://www.linkedin.com/in/orig-olivia/',
      social_proof: null,
    });
  });
});

describe('assemblePost — social-proof surfacing', () => {
  it('captures the connection name; author stays the post author', () => {
    const html = post(
      'urn:li:activity:4001',
      `<div class="update-components-header"><a href="https://www.linkedin.com/in/connie-nection/">Connie Nection</a> likes this</div>` +
        actor({
          href: 'https://www.linkedin.com/in/ada-lovelace/',
          name: 'Ada Lovelace',
          sub: '3h',
          degree: '3rd',
        }) +
        `<div class="update-components-text">Some content</div>`,
    );
    const p = assemblePost(fragment(html), ctx);
    expect(p).toMatchObject({
      is_repost: false,
      author_name: 'Ada Lovelace',
      social_proof: 'Connie Nection',
      author_degree: 'third',
    });
  });
});

describe('assemblePost — sponsored vs suggested', () => {
  it('skips a sponsored/promoted post', () => {
    const html = post(
      'urn:li:activity:6001',
      actor({ href: 'https://www.linkedin.com/company/adco/', name: 'AdCo', sub: 'Promoted' }) +
        `<div class="update-components-text">Buy now</div>`,
    );
    expect(assemblePost(fragment(html), ctx)).toBeNull();
  });

  it('keeps an algorithmic "Suggested" post', () => {
    const html = post(
      'urn:li:activity:7001',
      `<div class="update-components-header">Suggested</div>` +
        actor({
          href: 'https://www.linkedin.com/in/sam-suggested/',
          name: 'Sam Suggested',
          sub: '2d',
        }) +
        `<div class="update-components-text">Suggested content</div>`,
    );
    const p = assemblePost(fragment(html), ctx);
    expect(p).not.toBeNull();
    expect(p).toMatchObject({ is_repost: false, social_proof: null, author_name: 'Sam Suggested' });
  });
});

describe('assemblePost — company author + localized counts', () => {
  it('marks a company-page author and parses French grouped counts via the class fallback', () => {
    const html = post(
      'urn:li:activity:5001',
      actor({
        href: 'https://www.linkedin.com/company/globex-corp/',
        name: 'Globex Corp',
        sub: '1w',
      }) +
        `<div class="update-components-text">Company update</div>` +
        // aria-label is French ("réactions" ≠ "reaction"), so the reaction reader falls back to the
        // class selector and still reads the exact integer from the label.
        counts('1 234 réactions', '1,2 k', '12 commentaires'),
    );
    const p = assemblePost(fragment(html), ctx);
    expect(p).toMatchObject({
      author_type: 'company',
      author_name: 'Globex Corp',
      author_company: 'Globex Corp',
      author_degree: 'none',
      reaction_count: 1234,
      comment_count: 12,
    });
  });
});

describe('classifyPostType', () => {
  const wrap = (media: string): Element => fragment(`<div>${media}</div>`);
  it.each([
    ['<div class="update-components-poll"></div>', 'poll'],
    ['<div class="update-components-document"></div>', 'document'],
    ['<video></video>', 'video'],
    [
      '<div class="update-components-article"><span class="update-components-article__title">T</span></div>',
      'article',
    ],
    ['<div class="update-components-image"><img /><img /></div>', 'multi_image'],
    ['<div class="update-components-image"><img /></div>', 'image'],
    ['<span>just text</span>', 'text'],
  ])('classifies %s → %s', (media, expected) => {
    expect(classifyPostType(wrap(media))).toBe(expected);
  });
});

describe('classifySurface', () => {
  it('defaults to plain when there is no header, nested update, or promoted marker', () => {
    const html = post(
      'urn:li:activity:9001',
      actor({ href: 'https://www.linkedin.com/in/x/', name: 'X' }),
    );
    expect(classifySurface(fragment(html)).kind).toBe('plain');
  });
});

// ── Regression tests for review findings ──────────────────────────────────────────────────────

describe('social_proof is independent of repost-ness', () => {
  it('captures the connection even when the surfaced post is a quote repost', () => {
    const html = post(
      'urn:li:activity:8201',
      `<div class="update-components-header"><a href="https://www.linkedin.com/in/connie-nection/">Connie Nection</a> likes this</div>` +
        actor({ href: 'https://www.linkedin.com/in/resharer-rick/', name: 'Rick Resharer' }) +
        `<div class="update-components-text">Worth a look</div>` +
        `<div class="update-components-mini-update-v2" data-urn="urn:li:activity:8202">
          ${actor({ href: 'https://www.linkedin.com/in/orig-olivia/', name: 'Olivia Original' })}
          <div class="update-components-text">Original</div>
        </div>`,
    );
    expect(assemblePost(fragment(html), ctx)).toMatchObject({
      is_repost: true,
      author_name: 'Rick Resharer',
      original_author_name: 'Olivia Original',
      social_proof: 'Connie Nection',
    });
  });
});

describe('comment_count is not masked by the number-less "Comment" action button', () => {
  it('reads the real count from the counts summary even past the action button', () => {
    // No `.social-details-social-counts` wrapper → region falls back to root, where the action bar
    // exposes a number-less `aria-label="Comment"` button before the real count element.
    const html = post(
      'urn:li:activity:8001',
      actor({ href: 'https://www.linkedin.com/in/x/', name: 'X' }) +
        `<div class="social-actions"><button aria-label="Comment">Comment</button></div>` +
        `<span class="social-details-social-counts__comments">45 comments</span>`,
    );
    expect(assemblePost(fragment(html), ctx)?.comment_count).toBe(45);
  });
});

describe('author is never the social-proof connection', () => {
  it('skips the header link when the actor container class is absent (drift fallback)', () => {
    const html = post(
      'urn:li:activity:8101',
      `<div class="update-components-header"><a href="https://www.linkedin.com/in/connie-nection/">Connie Nection</a> likes this</div>` +
        `<div class="author"><a href="https://www.linkedin.com/in/ada-lovelace/">Ada Lovelace</a></div>` +
        `<div class="update-components-text">Body</div>`,
    );
    const p = assemblePost(fragment(html), ctx);
    expect(p?.author_profile_url).toBe('https://www.linkedin.com/in/ada-lovelace/');
    expect(p?.social_proof).toBe('Connie Nection');
  });
});

describe('extractTimestamp', () => {
  const sub = (s: string): Element =>
    fragment(`<div><span class="update-components-actor__sub-description">${s}</span></div>`);
  it.each([
    ['2h • Edited', '2h'],
    ['Edited • 2h', '2h'], // edited marker leads — still recovers the time
    ['3 mo', '3 mo'],
    ['Promoted', null],
  ] as const)('extractTimestamp(%s) → %o', (input, expected) => {
    expect(extractTimestamp(sub(input))).toBe(expected);
  });
});
