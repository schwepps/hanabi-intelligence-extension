/**
 * Selector map for LinkedIn's 2026 Server-Driven-UI feed (validated against the live rendered DOM).
 *
 * The feed is a virtualized `LazyColumn` under `[data-testid="mainFeed"]`; the classic
 * `feed-shared-*`/`update-components-*` markup and `data-urn` are gone. These anchors are the stable
 * ones that survived the SDUI migration: `data-testid`s, `aria-label` text, and href paths. The
 * post's activity URN is NOT in the DOM — it is read from React props in the MAIN world (react-urn.ts).
 */
/** The feed container (virtualized list of posts). */
export const FEED_TESTID = 'mainFeed';

/**
 * Post-detail (permalink `/posts/<slug>`) anchors. The detail page has NO `mainFeed`; it renders the
 * post + its comments as `[role="listitem"]`s inside a container whose auto-generated testid ends in
 * `FEED_DETAIL` (and, incidentally, contains the substring `commentList` — see the collision note on
 * `COMMENT_LIST_SELECTOR`). The post is the FIRST listitem. Validated live (2026 FR detail page).
 */
export const FEED_DETAIL_SELECTOR = '[data-testid*="FEED_DETAIL" i]';
export const LIST_ITEM_SELECTOR = '[role="listitem"]';

/**
 * On the detail page the post's canonical URN is exposed straight in the reaction-facepile testid
 * (`ReactionFacepileCollection-urn:li:activity:<id>` / `…ugcPost:<id>`) — the SAME activity/ugcPost URN
 * the feed reads from React props, so the dedup key matches. (The `/posts/…-share-<id>` URL id is a
 * DIFFERENT id space and must never be used as the key.)
 */
export const REACTION_FACEPILE_URN_SELECTOR =
  '[data-testid^="ReactionFacepileCollection-urn:li:activity:"], [data-testid^="ReactionFacepileCollection-urn:li:ugcPost:"]';

/** The rendered post/comment body (LinkedIn reuses this testid for both, clamped behind "see more"). */
export const EXPANDABLE_TEXT_SELECTOR = '[data-testid="expandable-text-box"]';
export const POST_TEXT_SELECTORS = [EXPANDABLE_TEXT_SELECTOR] as const;

/** A person's profile link — used where only `/in/` actors are wanted (post nodes, commenters). */
export const PERSON_LINK_SELECTOR = 'a[href*="/in/"]';

/** Author/actor profile links — the href PATH (`/in/` vs `/company/` vs `/school/`) is the type signal. */
export const AUTHOR_LINK_SELECTORS = [
  PERSON_LINK_SELECTOR,
  'a[href*="/company/"]',
  'a[href*="/school/"]',
] as const;

/** Hashtag anchors — the `/hashtag/` href path is stable. */
export const HASHTAG_SELECTORS = ['a[href*="/hashtag/"]'] as const;

/** Native video player marker for post_type. */
export const VIDEO_SELECTORS = ['video'] as const;

/**
 * A LinkedIn "document" post (multi-page PDF / slide carousel) renders a page-navigation control whose
 * button aria-labels name the document — FR "…page suivante du document", "Page 1 sur 8" ("document"
 * is spelled the same in FR/EN). Validated live (2026 FR feed) on 2 document posts, incl. a locked
 * "Déverrouiller tout le document" (nav buttons still present), and absent from ~20 non-document posts.
 * HIGH confidence — required because a wrong post_type is permanent at ingest (first-capture-wins).
 */
export const DOCUMENT_SELECTOR = 'button[aria-label*="document" i]';

/**
 * A shared native article / newsletter renders a card linking to the article at `/pulse/…`. Anchored
 * on the href PATH (locale-agnostic); the caller ignores a `/pulse/` link inside the post BODY, so only
 * a standalone card marks an article share. Validated live on 2 article cards. Non-pulse external-link
 * shares stay conservative `text` (an "amigoscode" post proved to be a plain image with the domain
 * watermarked INTO the image — external-domain text is not a reliable article signal).
 */
export const ARTICLE_LINK_SELECTOR = 'a[href*="/pulse/"]';

/**
 * The document/carousel title renders as a badge "<title> · <N> pages" (e.g. "n8n et Claude · 8 pages",
 * split across spans so the concatenated text may lack spaces). Anchored to END with the localized
 * "N page(s)" tail so a larger container (badge + reactions) can't match; capture group 1 is the title.
 */
export const MEDIA_PAGES_PATTERN = /^(.+?)\s*[·•|]?\s*\d+\s*pages?$/i;

/**
 * Engagement counts render as VISIBLE TEXT (not aria-labels) and are localized — e.g.
 * "1 234 réactions", "56 commentaires". Each pattern captures the leading number for
 * parseLocalizedCount. `\s` matches the NBSP / narrow-NBSP LinkedIn uses as a group separator.
 */
export const REACTION_COUNT_PATTERN =
  /(\d[\d.,\s']*)\s*(?:réactions?|reactions?|j.?aime|likes?)\b/i;
export const COMMENT_COUNT_PATTERN = /(\d[\d.,\s']*)\s*(?:commentaires?|comments?)\b/i;

/** Embedded comment thread under a post. */
export const COMMENT_LIST_SELECTOR = '[data-testid*="commentList" i]';

/**
 * The relative timestamp LinkedIn renders in the actor block ("16 h •", "15 min •", "5 h • Modifié",
 * "3 j"). Validated live (FR feed, 2026): a plain `<span>`, NO `<time>` element. Anchored at `^` and
 * requiring a unit `\b` so a headline that merely starts with a number ("5 ans d'expérience") can't
 * match; capture group 1 is the verbatim token (backend derives the date). FR + EN units; the bare
 * `m` minute/month ambiguity is avoided by only matching `min` / `mo`.
 */
export const POSTED_AT_PATTERN =
  /^(à l['’ ]instant|maintenant|just now|now|\d+\s*(?:secondes?|sec|s|minutes?|min|heures?|hrs?|hr|h|jours?|j|days?|d|semaines?|sem|wk|w|mois|months?|mo|années?|ans?|an|yrs?|yr|y))\b/i;

/**
 * The author's headline/occupation subtitle in the actor block ("Founder at Globex", "Directrice chez
 * Renault", "CEO @ Acme"). Best-effort, mutable: split only on a clear `chez`/`at`/`@` delimiter — FR
 * headlines are noisy free-text taglines — else leave both company/title null. title = group 1 || 3,
 * company = group 2 || 4. Applied to the FIRST `|`/`·`/`•` segment so trailing tagline noise is dropped.
 */
export const HEADLINE_SPLIT_PATTERN = /^(.+?)\s+(?:chez|at)\s+(.+)$|^(.+?)\s*@\s*(.+)$/i;

/**
 * A quote-repost (reshare-with-thoughts) embeds the original post as a nested card that links to the
 * original UPDATE (`/feed/update/…`). Grounded on a live quote-repost: the original author + body sit
 * inside that card, distinct from the resharer above it. A plain (non-reshare) feed post exposes no
 * such link — validated absent across 70+ live feed posts — so its presence marks the embedded original.
 * Anchors the reshared-card scan in `findResharedCard`; the post's own URN comes from React props, never
 * a DOM `/feed/update/` link.
 */
export const RESHARED_UPDATE_LINK_SELECTOR = 'a[href*="/feed/update/"]';

/**
 * Context-header verbs (the line above a post) that mark a SOCIAL-PROOF surfacing — a 1st-degree
 * connection engaged with the post. Localized (FR + EN). Distinct from a repost surfacing.
 */
export const ENGAGEMENT_SURFACE_PATTERN =
  /(a aimé|a commenté|a ajouté un commentaire|a réagi|aime ceci|a recommandé|recommande ceci|likes this|commented on|celebrates this|loves this|reacted to|finds this)/i;
/** Context-header verbs that mark a reshare/repost surfacing. */
export const REPOST_SURFACE_PATTERN = /(a republié|a partagé|reposted this|reposted)/i;
