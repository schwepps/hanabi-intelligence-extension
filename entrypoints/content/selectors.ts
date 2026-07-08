/**
 * THE selector map — the single place raw CSS selectors and DOM anchors live, so a LinkedIn
 * redesign is a one-file diff. Every target is an ORDERED list (most-stable anchor first:
 * `data-*` / `role` / `aria-*` / href path → class hint last); helpers return on the first hit.
 *
 * Stability legend:
 *  - Identity/root/container anchors below are STRUCTURAL (URN attributes, the `main` landmark) and
 *    high-confidence; still confirm on the live 2026 feed.
 *  - The rich-field targets (author/text/counts/degree/verbs) are CLASS-DEPENDENT and rot — they are
 *    a Phase-B seam, to be filled and fixture-tested against real captured HTML during the live recon.
 */
import { queryAll } from './dom';

/** Bump when the map changes so backend/telemetry can correlate a data-quality shift to a version. */
export const SELECTOR_MAP_VERSION = '2026.07.0-alpha';

// ── Identity / post root (STABLE) ──────────────────────────────────────────────────────────────

/** Organic post URN namespaces. Sponsored content uses a different namespace and is skipped. */
export const POST_URN_PATTERN = /urn:li:(?:activity|ugcPost|share):\d+/;

/** Attributes that may carry a post's URN, in priority order. */
export const POST_URN_ATTRS = ['data-urn', 'data-id'] as const;

/** Selectors identifying a feed post root; findPostRoots() keeps only top-level updates. */
export const POST_ROOT_SELECTORS = [
  '[data-urn^="urn:li:activity:"]',
  '[data-urn^="urn:li:ugcPost:"]',
  '[data-urn^="urn:li:share:"]',
  '[data-id^="urn:li:activity:"]',
] as const;

/** The scrolling feed container to observe. `main` is the stable landmark anchor. */
export const FEED_CONTAINER_SELECTORS = ['main', '[role="main"]'] as const;

/**
 * Post roots currently in `container`. Keeps only top-level updates: a node nested inside another
 * matched update (e.g. the inner original post of a quote-repost) is not its own post.
 */
export function findPostRoots(container: ParentNode): Element[] {
  const all = queryAll(container, POST_ROOT_SELECTORS);
  return all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
}

// ── Rich fields (Phase B) ────────────────────────────────────────────────────────────────────────
// ⚠️ PROVISIONAL: the class-based entries (`update-components-*`, `feed-shared-*`,
// `social-details-social-counts`) are LinkedIn's long-standing families but are NOT yet confirmed
// against the live 2026 DOM. Each list is ordered stable-anchor-first (href path / aria / role /
// hidden-accessible text) so it degrades even if a class drifts; the live recon confirms/replaces
// the class entries (a one-file diff) and swaps the synthetic test fixtures for real captures.

/** The author ("actor") block containing name/headline/timestamp/degree. */
export const ACTOR_CONTAINER_SELECTORS = [
  '.update-components-actor',
  '.update-components-actor--with-control-menu',
] as const;

/** The actor's profile link — the href PATH (`/in/` vs `/company/`) is the stable anchor. */
export const AUTHOR_LINK_SELECTORS = [
  'a[href*="/in/"]',
  'a[href*="/company/"]',
  'a[href*="/school/"]',
] as const;

/** The visible author name (LinkedIn duplicates it in an aria-hidden span). */
export const AUTHOR_NAME_SELECTORS = [
  '.update-components-actor__title span[aria-hidden="true"]',
  '.update-components-actor__title',
  '.update-components-actor__name',
] as const;

/** The author's headline / subtitle. */
export const AUTHOR_TITLE_SELECTORS = [
  '.update-components-actor__description',
  '.update-components-actor__subtitle',
] as const;

/** The connection-degree badge text ("2nd", "· 2nd", "2e"). */
export const DEGREE_BADGE_SELECTORS = [
  '.update-components-actor__supplementary-actor-info',
  '.update-components-actor__badge',
  '.artdeco-entity-lockup__badge',
] as const;

/** The actor sub-description holding the relative timestamp + "Edited"/"Promoted"/"Suggested". */
export const TIMESTAMP_SELECTORS = ['.update-components-actor__sub-description', 'time'] as const;

/** The context header above a post ("X reposted this" / "X likes this"). */
export const SURFACE_HEADER_SELECTORS = [
  '.update-components-header',
  '.update-components-header__text-view',
  '.feed-shared-header',
] as const;

/** A nested (reshared) update embedded inside a quote-repost — carries the ORIGINAL post. */
export const NESTED_UPDATE_SELECTORS = [
  '.update-components-mini-update-v2',
  '.update-components-update-v2__reshared-content',
  '[data-urn^="urn:li:activity:"] [data-urn^="urn:li:activity:"]',
] as const;

/** The post body / commentary text. */
export const POST_TEXT_SELECTORS = [
  '.update-components-text',
  '.feed-shared-update-v2__description',
  '.update-components-update-v2__commentary',
] as const;

/** Hashtag anchors — the `/feed/hashtag/` (or `/hashtag/`) href path is STABLE. */
export const HASHTAG_SELECTORS = ['a[href*="/hashtag/"]'] as const;

/** The social-counts region (reactions on one side, comments/reposts on the other). */
export const SOCIAL_COUNTS_SELECTORS = ['.social-details-social-counts'] as const;

/** Reaction count — prefer the exact integer in an aria-label over abbreviated visible text. */
export const REACTION_COUNT_SELECTORS = [
  '[aria-label*="reaction" i]',
  '.social-details-social-counts__reactions-count',
  '.social-details-social-counts__count-value',
] as const;

/** Comment count — parsed separately from reactions and reposts. */
export const COMMENT_COUNT_SELECTORS = [
  'button[aria-label*="comment" i]',
  'a[aria-label*="comment" i]',
  '.social-details-social-counts__comments',
] as const;

/** Document/carousel or shared-article title. */
export const MEDIA_TITLE_SELECTORS = [
  '.update-components-article__title',
  '.update-components-document__title',
  '[data-test-document-title]',
] as const;

// post_type probes, checked in priority order (see extract/content.ts::classifyPostType).
export const POLL_SELECTORS = ['.update-components-poll', '[data-test-poll]'] as const;
export const DOCUMENT_SELECTORS = [
  '.update-components-document',
  '.document-s-container',
  'iframe[title*="document" i]',
] as const;
export const VIDEO_SELECTORS = [
  'video',
  '.update-components-linkedin-video',
  '[data-test-id="video"]',
] as const;
export const ARTICLE_SELECTORS = [
  '.update-components-article',
  '.update-components-entity',
] as const;
export const IMAGE_CONTAINER_SELECTORS = [
  '.update-components-image',
  '.feed-shared-image',
] as const;
export const IMAGE_SELECTORS = ['img'] as const;
