import type { PostPayload } from '@/shared/payload';
import {
  classifyPostType,
  extractAuthor,
  extractCounts,
  extractHashtags,
  extractText,
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
 * author_name/profile_url/type, text, reaction_count, comment_count, hashtags, post_type (video +
 * image/multi_image). Best-effort / deferred fields default here and are hardened in later passes:
 * author_company, author_title, posted_at_raw, author_degree, social_proof, repost provenance,
 * media_title, and document/poll/article post_type.
 */
export function assemblePost(
  post: Element,
  urn: string | null,
  context: AssembleContext,
): PostPayload | null {
  if (!urn) return null;

  const author = extractAuthor(post);
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
    is_repost: false,
    original_author_name: null,
    original_author_profile_url: null,
    media_title: null,
    hashtags: extractHashtags(post),
    reaction_count: counts.reaction_count,
    comment_count: counts.comment_count,
    posted_at_raw: null,
    author_degree: 'none',
    social_proof: null,
  };
}
