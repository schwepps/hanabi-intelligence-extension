import type { PostPayload } from '@/shared/payload';
import {
  classifyPostType,
  extractAuthor,
  extractComments,
  extractCounts,
  extractHashtags,
  extractText,
  findSurfaceHeader,
  resolveRepost,
} from './fields';

export interface AssembleContext {
  /** ISO timestamp for `captured_at`; injected for deterministic tests. */
  now: () => string;
}

/**
 * Build a `PostPayload` from a rendered post node + its activity URN (read separately from React
 * props in the MAIN world). Returns null when the URN is missing — no dedup key ⇒ skip.
 *
 * Production-confidence fields (validated against the live feed): linkedin_post_id, url,
 * author_name/profile_url/type, text, reaction_count, hashtags, post_type (video), social_proof
 * (from an engagement context header), comments, and repost provenance — original author for both a
 * plain reshare and a quote-repost (`resolveRepost`, FSC-115). Best-effort / deferred fields default
 * here and are hardened in later passes: author_company, author_title, posted_at_raw, author_degree,
 * comment_count, media_title, and non-video post_type.
 *
 * The surface header is resolved first: it feeds social_proof + is_repost AND is excluded from the
 * author scan, so on a surfaced post the author is the poster, not the surfacing connection. On a
 * plain reshare that means `author` IS the original poster; a quote-repost's original author comes from
 * the embedded reshared card. Either way `resolveRepost` attributes to the original, never the resharer.
 */
export function assemblePost(
  post: Element,
  urn: string | null,
  context: AssembleContext,
): PostPayload | null {
  if (!urn) return null;

  const header = findSurfaceHeader(post);
  const author = extractAuthor(post, header?.el);
  const repost = resolveRepost(post, header, author);
  const counts = extractCounts(post);

  return {
    linkedin_post_id: urn,
    url: `https://www.linkedin.com/feed/update/${urn}/`,
    captured_at: context.now(),
    text: extractText(post),
    author_name: author.name,
    author_profile_url: author.profile_url,
    author_type: author.type,
    author_company: null,
    author_title: null,
    post_type: classifyPostType(post),
    is_repost: repost.is_repost,
    original_author_name: repost.original_author_name,
    original_author_profile_url: repost.original_author_profile_url,
    media_title: null,
    hashtags: extractHashtags(post),
    reaction_count: counts.reaction_count,
    comment_count: counts.comment_count,
    posted_at_raw: null,
    author_degree: 'none',
    social_proof: header?.kind === 'engagement' ? header.name : null,
    comments: extractComments(post),
  };
}
