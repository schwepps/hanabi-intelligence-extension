import { FEED_TESTID } from './selectors';

/** The feed container element, or null if not mounted / not on the feed. */
export function findFeedRoot(scope: ParentNode): Element | null {
  return scope.querySelector(`[data-testid="${FEED_TESTID}"]`);
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
  const hasAuthor = el.querySelector('a[href*="/in/"], a[href*="/company/"]') !== null;
  const hasBody =
    el.querySelector('[data-testid="expandable-text-box"]') !== null ||
    el.querySelector('img') !== null;
  return hasAuthor && hasBody;
}
