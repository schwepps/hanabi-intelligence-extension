// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { assemblePost } from '@/entrypoints/content/feed/assemble';
import { findPermalinkPostNode } from '@/entrypoints/content/feed/nodes';
import { urnFromReactionFacepile } from '@/entrypoints/content/feed/react-urn';
import { fragment } from '../support/dom';

const ctx = { now: () => '2026-07-10T12:00:00.000Z' };

/**
 * A post-detail (permalink) page, mirroring the live DOM: the FEED_DETAIL container — whose
 * auto-generated testid contains BOTH `commentList` and `FEED_DETAIL` — wraps the post as the FIRST
 * `[role="listitem"]`, a comment as the next listitem, and the post's reaction facepile (carrying the
 * canonical activity urn, distinct from the URL's share-id) as a sibling of the listitems.
 */
const detail = () =>
  fragment(`
    <div data-testid="Cgs9-commentListZ42-FeedType_FEED_DETAIL">
      <div role="listitem">
        <div>
          <a href="https://www.linkedin.com/in/gabrielpichot/" aria-label="Gabriel"><img alt="" /></a>
          <a href="https://www.linkedin.com/in/gabrielpichot/"><span>Gabriel Pichot</span><span> • 2e</span></a>
          <span>1 j •</span>
          <div data-testid="expandable-text-box">Je recrute 2 profils seniors sur Paris</div>
          <span>63 réactions</span>
        </div>
      </div>
      <div role="listitem">
        <a href="https://www.linkedin.com/in/valentin/"><span>Valentin Dosimont</span></a>
        <div data-testid="expandable-text-box">Hyper intéressé</div>
      </div>
      <div data-testid="ReactionFacepileCollection-urn:li:activity:7480918738939236352"></div>
    </div>`);

describe('findPermalinkPostNode', () => {
  it('returns the first listitem (the post), not a comment', () => {
    detail();
    const node = findPermalinkPostNode(document);
    expect(node?.querySelector('a[href*="/in/"]')?.getAttribute('href')).toBe(
      'https://www.linkedin.com/in/gabrielpichot/',
    );
  });

  it('returns null without a FEED_DETAIL container', () => {
    fragment('<div><a href="/in/x/">x</a><div data-testid="expandable-text-box">t</div></div>');
    expect(findPermalinkPostNode(document)).toBeNull();
  });
});

describe('urnFromReactionFacepile', () => {
  it('reads the canonical activity urn from the facepile testid', () => {
    const root = detail();
    expect(urnFromReactionFacepile(root)).toBe('urn:li:activity:7480918738939236352');
  });

  it('reads a ugcPost urn and is null when no facepile is present', () => {
    const root = fragment(
      '<div><div data-testid="ReactionFacepileCollection-urn:li:ugcPost:55"></div></div>',
    );
    expect(urnFromReactionFacepile(root)).toBe('urn:li:ugcPost:55');
    expect(urnFromReactionFacepile(fragment('<div></div>'))).toBeNull();
  });
});

describe('permalink capture (isolated clone defeats the commentList-ancestor collision)', () => {
  it('assembles the post from a detached clone with the correct author + canonical urn', () => {
    const root = detail();
    const post = findPermalinkPostNode(document);
    if (!post) throw new Error('post node not found');
    const urn = urnFromReactionFacepile(root);
    const payload = assemblePost(post.cloneNode(true) as Element, urn, ctx);
    expect(payload).toMatchObject({
      linkedin_post_id: 'urn:li:activity:7480918738939236352', // NOT the URL share-id
      author_name: 'Gabriel Pichot',
      author_degree: 'second',
      author_profile_url: 'https://www.linkedin.com/in/gabrielpichot/',
      text: 'Je recrute 2 profils seniors sur Paris',
      reaction_count: 63,
      is_repost: false,
      social_proof: null, // feed-only surfacing signal is absent on a permalink
    });
  });

  it('WOULD blank the author + counts without the clone — documents why the clone is required', () => {
    detail();
    const post = findPermalinkPostNode(document);
    if (!post) throw new Error('post node not found');
    // Assembling the LIVE node: closest(COMMENT_LIST_SELECTOR) escapes up to the `commentList`-named
    // FEED_DETAIL ancestor, so the field extractors treat the post itself as comment content.
    const payload = assemblePost(post, 'urn:li:activity:7480918738939236352', ctx);
    expect(payload?.author_name).toBeNull();
    expect(payload?.reaction_count).toBe(0);
  });
});
