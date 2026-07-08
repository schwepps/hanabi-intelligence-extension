import type { PostPayload } from '@/shared/payload';
import { FIELD_DEFAULTS } from '@/shared/payload';
import { extractIdentity } from './identity';

export interface ExtractContext {
  /** ISO timestamp for `captured_at`; injected so tests are deterministic. */
  now: () => string;
}

const defaultContext: ExtractContext = {
  now: () => new Date().toISOString(),
};

/**
 * Compose a `PostPayload` from a post root, or null to skip the post.
 *
 * Fail-soft policy: the post is skipped ONLY when `linkedin_post_id` is unresolvable (no dedup key
 * → unusable record). Every other field fails soft to its contract default so one broken selector
 * never drops an otherwise-usable post. The exact object literal returned gives compile-time
 * completeness (TS guarantees no contract field is omitted).
 *
 * Phase A (this ticket): identity from the stable URN anchor; all rich fields default. Phase B
 * (after live-feed recon) fills the marked seam with author/content/engagement/repost extractors
 * plus the sponsored/repost/social-proof surface classifier, TDD'd against real fixtures.
 */
export function assemblePost(
  root: Element,
  context: ExtractContext = defaultContext,
): PostPayload | null {
  const identity = extractIdentity(root);
  if (!identity) return null;

  return {
    linkedin_post_id: identity.linkedin_post_id,
    url: identity.url,
    captured_at: context.now(),

    // ── Phase-B seam: rich fields default until the recon-backed extractors land ──
    text: null,
    author_name: null,
    author_company: null,
    author_title: null,
    author_profile_url: null,
    author_type: FIELD_DEFAULTS.author_type,
    post_type: FIELD_DEFAULTS.post_type,
    is_repost: FIELD_DEFAULTS.is_repost,
    original_author_name: null,
    original_author_profile_url: null,
    media_title: null,
    hashtags: [],
    reaction_count: FIELD_DEFAULTS.reaction_count,
    comment_count: FIELD_DEFAULTS.comment_count,
    posted_at_raw: null,
    author_degree: FIELD_DEFAULTS.author_degree,
    social_proof: null,
  };
}
