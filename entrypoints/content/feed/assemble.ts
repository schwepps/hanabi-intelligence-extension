import type { PostPayload } from '@/shared/payload';
import {
  classifyPostType,
  extractAuthor,
  extractAuthorHeadline,
  extractComments,
  extractCounts,
  extractHashtags,
  extractMediaTitle,
  extractPostedAt,
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
 * author_name/profile_url/type, author_degree (name badge), text, reaction_count, hashtags,
 * post_type video/document/article + media_title, posted_at_raw, social_proof
 * (from an engagement context header), comments, and repost provenance — original author for both a
 * plain reshare and a quote-repost (`resolveRepost`). Best-effort: author_company/author_title
 * (headline split). Still deferred (safe default until a durable anchor lands): comment_count,
 * and post_type image/multi_image/poll — no reliable SDUI anchor, kept conservative `text` since a
 * mistype is permanent at ingest.
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
  const headline = extractAuthorHeadline(post, header?.el);
  const repost = resolveRepost(post, header, author);
  const counts = extractCounts(post);
  const postType = classifyPostType(post);

  return {
    linkedin_post_id: urn,
    url: `https://www.linkedin.com/feed/update/${urn}/`,
    captured_at: context.now(),
    text: extractText(post),
    author_name: author.name,
    author_profile_url: author.profile_url,
    author_type: author.type,
    author_company: headline.company,
    author_title: headline.title,
    post_type: postType,
    is_repost: repost.is_repost,
    original_author_name: repost.original_author_name,
    original_author_profile_url: repost.original_author_profile_url,
    media_title: extractMediaTitle(post, postType),
    hashtags: extractHashtags(post),
    reaction_count: counts.reaction_count,
    comment_count: counts.comment_count,
    posted_at_raw: extractPostedAt(post),
    author_degree: author.degree,
    social_proof: header?.kind === 'engagement' ? header.name : null,
    comments: extractComments(post),
  };
}
