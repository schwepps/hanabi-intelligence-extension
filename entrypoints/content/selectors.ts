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

// ── Rich fields (CLASS-DEPENDENT — Phase B, fill during live recon) ──────────────────────────────
// Intentionally empty until confirmed against real fixtures. Empty lists make every rich extractor
// fail soft to its contract default, so Phase A stays correct (just sparse). See extract/index.ts.
//
// export const AUTHOR_NAME_SELECTORS = [...] as const;
// export const AUTHOR_LINK_SELECTORS = [...] as const;
// export const POST_TEXT_SELECTORS = [...] as const;
// export const HASHTAG_SELECTORS = ['a[href*="/hashtag/"]'] as const;   // href path is STABLE
// export const REACTION_COUNT_SELECTORS = [...] as const;
// export const COMMENT_COUNT_SELECTORS = [...] as const;
// export const TIMESTAMP_SELECTORS = [...] as const;
// export const DEGREE_BADGE_SELECTORS = [...] as const;
// export const SURFACE_HEADER_SELECTORS = [...] as const;
