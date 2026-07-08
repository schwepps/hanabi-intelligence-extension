import { queryAll, queryFirst } from '../dom';
import { parseLocalizedCount } from '../parse/number';
import {
  COMMENT_COUNT_SELECTORS,
  REACTION_COUNT_SELECTORS,
  SOCIAL_COUNTS_SELECTORS,
} from '../selectors';

export interface EngagementFields {
  reaction_count: number;
  comment_count: number;
}

/**
 * Reaction and comment counts as SEPARATE values, read from the social-counts summary (not the
 * action bar). Prefers the exact integer in an `aria-label` over abbreviated visible text.
 * Defaults to 0 (a shown-but-empty count is genuinely zero).
 */
export function extractEngagement(root: Element): EngagementFields {
  const region = queryFirst(root, SOCIAL_COUNTS_SELECTORS) ?? root;
  return {
    reaction_count: readCount(region, REACTION_COUNT_SELECTORS),
    comment_count: readCount(region, COMMENT_COUNT_SELECTORS),
  };
}

/**
 * First candidate element that yields a number. Iterating (not just the first match) skips the
 * number-less "Comment" action button so a real count elsewhere isn't masked to 0. NOTE: for a
 * combined label ("1,234 reactions and 56 comments") this returns the first numeric run — a known
 * limitation to revisit against real aria-label formats during the live recon.
 */
function readCount(scope: Element, selectors: readonly string[]): number {
  for (const el of queryAll(scope, selectors)) {
    const fromLabel = parseLocalizedCount(el.getAttribute('aria-label'));
    if (fromLabel != null) return fromLabel;
    const fromText = parseLocalizedCount(el.textContent);
    if (fromText != null) return fromText;
  }
  return 0;
}
