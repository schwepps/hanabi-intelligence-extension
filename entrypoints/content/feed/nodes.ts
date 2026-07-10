import {
  AUTHOR_LINK_SELECTORS,
  EXPANDABLE_TEXT_SELECTOR,
  FEED_DETAIL_SELECTOR,
  FEED_TESTID,
  LIST_ITEM_SELECTOR,
} from './selectors';

/** The feed container element, or null if not mounted / not on the feed. */
export function findFeedRoot(scope: ParentNode): Element | null {
  return scope.querySelector(`[data-testid="${FEED_TESTID}"]`);
}

/**
 * The single post on a permalink detail page (`/posts/<slug>`): the FIRST `[role="listitem"]` inside
 * the `FEED_DETAIL` container — comments are the subsequent listitems. Validated with `isPostNode`
 * (author link + body). Null until the detail hydrates (the caller retries on the next settle). The
 * post is captured from an ISOLATED clone of this node (see feed-reader.content.ts), so the
 * `commentList`-named detail container can't blank the post's fields via `closest(...)`.
 */
export function findPermalinkPostNode(scope: ParentNode): Element | null {
  const detail = scope.querySelector(FEED_DETAIL_SELECTOR);
  const post = detail?.querySelector(LIST_ITEM_SELECTOR) ?? null;
  return post && isPostNode(post) ? post : null;
}

/**
 * Candidate post nodes: the feed's direct children that look like a post (an author link plus a
 * body — text box or image). This over-selects slightly (e.g. suggestion cards); the URN gate in
 * assembly drops anything without a real activity URN, so non-posts fall out there.
 */
export function findPostNodes(feedRoot: Element): Element[] {
  return [...feedRoot.children].filter(isPostNode);
}

export function isPostNode(el: Element): boolean {
  const hasAuthor = el.querySelector(AUTHOR_LINK_SELECTORS.join(',')) !== null;
  const hasBody =
    el.querySelector(EXPANDABLE_TEXT_SELECTOR) !== null || el.querySelector('img') !== null;
  return hasAuthor && hasBody;
}
