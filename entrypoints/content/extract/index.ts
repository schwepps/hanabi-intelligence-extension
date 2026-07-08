import type { PostPayload } from '@/shared/payload';
import { extractActor } from './author';
import { classifyPostType, extractHashtags, extractMediaTitle, extractText } from './content';
import { extractEngagement } from './engagement';
import { extractIdentity } from './identity';
import { classifySurface } from './repost';
import { extractTimestamp } from './timestamp';

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
 * Skips only when the post is sponsored (paid ad) or `linkedin_post_id` is unresolvable (no dedup
 * key). Every other field fails soft to a default so one broken selector never drops a usable post.
 * The exact object literal gives compile-time completeness (no contract field can be omitted).
 *
 * Repost/social-proof scoping (the correctness-critical part):
 *  - quote repost → author = the resharer (outer actor); original_author = the inner original;
 *    body/media (post_type, media_title) read from the inner original post.
 *  - plain repost ("X reposted this") → the body actor IS the original; author = original_author.
 *  - social-proof surfacing ("X likes this") → author unchanged; social_proof = the connection.
 */
export function assemblePost(
  root: Element,
  context: ExtractContext = defaultContext,
): PostPayload | null {
  const identity = extractIdentity(root);
  if (!identity) return null;

  const surface = classifySurface(root);
  if (surface.kind === 'sponsored') return null;

  const isRepost = surface.kind === 'repost_quote' || surface.kind === 'repost_plain';
  // A quote repost's substance (media/original body) lives in the nested update; everything else
  // reads from the outer post. `inner` is only non-null for a quote repost.
  const inner = surface.kind === 'repost_quote' ? surface.inner : null;
  const bodyScope: Element = inner ?? root;

  const actor = extractActor(root);
  const { originalName, originalUrl } = resolveOriginalAuthor(surface, inner, actor);
  const engagement = extractEngagement(root);

  return {
    linkedin_post_id: identity.linkedin_post_id,
    url: identity.url,
    captured_at: context.now(),
    text: extractText(root),
    author_name: actor.name,
    author_company: actor.company,
    author_title: actor.title,
    author_profile_url: actor.profile_url,
    author_type: actor.type,
    post_type: classifyPostType(bodyScope),
    is_repost: isRepost,
    original_author_name: originalName,
    original_author_profile_url: originalUrl,
    media_title: extractMediaTitle(bodyScope),
    // Hashtags scoped to THIS payload's author: for a quote repost, exclude the nested original's
    // tags (they belong to the original post) so they aren't attributed to the resharer.
    hashtags: extractHashtags(root, inner),
    reaction_count: engagement.reaction_count,
    comment_count: engagement.comment_count,
    posted_at_raw: extractTimestamp(root),
    author_degree: actor.degree,
    social_proof: surface.socialProof,
  };
}

function resolveOriginalAuthor(
  surface: ReturnType<typeof classifySurface>,
  inner: Element | null,
  actor: ReturnType<typeof extractActor>,
): { originalName: string | null; originalUrl: string | null } {
  if (inner) {
    const original = extractActor(inner);
    return { originalName: original.name, originalUrl: original.profile_url };
  }
  if (surface.kind === 'repost_plain') {
    // Plain repost: the body actor IS the original author (FSC-98 stores against the original).
    return { originalName: actor.name, originalUrl: actor.profile_url };
  }
  return { originalName: null, originalUrl: null };
}
