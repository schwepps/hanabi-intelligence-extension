/**
 * Selector map for LinkedIn's 2026 Server-Driven-UI feed (validated against the live rendered DOM).
 *
 * The feed is a virtualized `LazyColumn` under `[data-testid="mainFeed"]`; the classic
 * `feed-shared-*`/`update-components-*` markup and `data-urn` are gone. These anchors are the stable
 * ones that survived the SDUI migration: `data-testid`s, `aria-label` text, and href paths. The
 * post's activity URN is NOT in the DOM — it is read from React props in the MAIN world (react-urn.ts).
 */
export const SELECTOR_MAP_VERSION = '2026.07-sdui.1';

/** The feed container (virtualized list of posts). */
export const FEED_TESTID = 'mainFeed';

/** Post body text (already rendered; clamped behind "see more" but present). */
export const POST_TEXT_SELECTORS = ['[data-testid="expandable-text-box"]'] as const;

/** Author/actor profile links — the href PATH (`/in/` vs `/company/`) is the stable type signal. */
export const AUTHOR_LINK_SELECTORS = [
  'a[href*="/in/"]',
  'a[href*="/company/"]',
  'a[href*="/school/"]',
] as const;

/** Hashtag anchors — the `/hashtag/` href path is stable. */
export const HASHTAG_SELECTORS = ['a[href*="/hashtag/"]'] as const;

/** Native video player marker for post_type. */
export const VIDEO_SELECTORS = ['video'] as const;

/**
 * Engagement counts render as VISIBLE TEXT (not aria-labels) and are localized — e.g.
 * "1 234 réactions", "56 commentaires". Each pattern captures the leading number for
 * parseLocalizedCount. `\s` matches the NBSP / narrow-NBSP LinkedIn uses as a group separator.
 */
export const REACTION_COUNT_PATTERN =
  /(\d[\d.,\s']*)\s*(?:réactions?|reactions?|j.?aime|likes?)\b/i;
export const COMMENT_COUNT_PATTERN = /(\d[\d.,\s']*)\s*(?:commentaires?|comments?)\b/i;
