/**
 * The post payload contract (FSC-98), single source of truth for the extension.
 *
 * FSC-98 (`Hanabi-app` ingestion) is still unstarted and calls this payload "authoritative for the
 * extension (FSC-110)", so the concrete field-level shape is defined HERE and must be mirrored by
 * the backend when it is built. Do not diverge without updating `Hanabi-app` in parallel.
 *
 * Routing (enforced backend-side): every field lands on `items` EXCEPT `author_degree` and
 * `social_proof`, which are per-sensor and land on `item_sources` (RLS-protected). `posted_at` is
 * derived server-side from `posted_at_raw` + `captured_at`.
 */

export const AUTHOR_TYPES = ['person', 'company'] as const;
export type AuthorType = (typeof AUTHOR_TYPES)[number];

export const POST_TYPES = [
  'text',
  'image',
  'multi_image',
  'video',
  'document',
  'poll',
  'article',
] as const;
export type PostType = (typeof POST_TYPES)[number];

export const AUTHOR_DEGREES = ['first', 'second', 'third', 'none'] as const;
export type AuthorDegree = (typeof AUTHOR_DEGREES)[number];

export interface PostPayload {
  /** Full activity URN, e.g. `urn:li:activity:7123456789`. Dedup key on both ends. */
  linkedin_post_id: string;
  /** Post body as already rendered (never expanded via "see more"); null for media-only posts. */
  text: string | null;
  /** Derived from the URN: `https://www.linkedin.com/feed/update/<urn>/`. */
  url: string;
  author_name: string | null;
  author_company: string | null;
  author_title: string | null;
  author_profile_url: string | null;
  author_type: AuthorType;
  post_type: PostType;
  is_repost: boolean;
  /** Original author of a reshare (name), never the resharer. Null when not a repost. */
  original_author_name: string | null;
  original_author_profile_url: string | null;
  /** Document/carousel or shared-article title, when visible. */
  media_title: string | null;
  hashtags: string[];
  reaction_count: number;
  comment_count: number;
  /** LinkedIn's relative timestamp string, verbatim ("2h", "3 mo"). Backend derives the date. */
  posted_at_raw: string | null;
  /** ISO-8601 capture time (generated, not scraped). */
  captured_at: string;
  /** Author's connection degree to the sensor. Per-sensor warm-intro signal. */
  author_degree: AuthorDegree;
  /** Name of the 1st-degree connection whose engagement surfaced the post. Per-sensor signal. */
  social_proof: string | null;
  /**
   * Visible preview comments on the post — a warm-intro signal (who engaged, and how). Empty when
   * none are rendered. ⚠️ CONTRACT EXTENSION beyond the original FSC-98 field list: mirror this in
   * `Hanabi-app` (likely a related `item_comments` / per-sensor table) before relying on it.
   */
  comments: CommentSignal[];
}

/** A single visible comment under a feed post (commenter identity + text). */
export interface CommentSignal {
  author_name: string | null;
  author_profile_url: string | null;
  text: string | null;
}

/**
 * Fields whose absence forces the whole post to be skipped (no usable record without them).
 * Only the dedup key is truly load-bearing; everything else fails soft to a default.
 */
export const REQUIRED_FIELDS = [
  'linkedin_post_id',
] as const satisfies readonly (keyof PostPayload)[];

/**
 * Non-null defaults applied when an optional field cannot be extracted. Nullable string fields
 * default to `null` and are handled at the composition site; these are the meaningful non-null ones.
 */
export const FIELD_DEFAULTS: {
  author_type: AuthorType;
  post_type: PostType;
  is_repost: boolean;
  reaction_count: number;
  comment_count: number;
  author_degree: AuthorDegree;
} = {
  author_type: 'person',
  post_type: 'text',
  is_repost: false,
  reaction_count: 0,
  comment_count: 0,
  author_degree: 'none',
};
