import type { PostType } from '@/shared/payload';
import { cleanText, queryAll, queryFirst, queryText } from '../dom';
import {
  ARTICLE_SELECTORS,
  DOCUMENT_SELECTORS,
  HASHTAG_SELECTORS,
  IMAGE_CONTAINER_SELECTORS,
  IMAGE_SELECTORS,
  MEDIA_TITLE_SELECTORS,
  POLL_SELECTORS,
  POST_TEXT_SELECTORS,
  VIDEO_SELECTORS,
} from '../selectors';

/** The post body / commentary as already rendered (never expanded via "see more"). */
export function extractText(scope: Element): string | null {
  return queryText(scope, POST_TEXT_SELECTORS);
}

/** Document/carousel or shared-article title, when visible. */
export function extractMediaTitle(scope: Element): string | null {
  return queryText(scope, MEDIA_TITLE_SELECTORS);
}

/**
 * Visible hashtags, `#`-stripped and de-duplicated. Prefers the stable href over anchor text.
 * `excludeWithin` (a nested reshared update) is skipped so a quote-repost's own tags aren't mixed
 * with the original post's.
 */
export function extractHashtags(scope: Element, excludeWithin?: Element | null): string[] {
  const tags: string[] = [];
  for (const anchor of queryAll(scope, HASHTAG_SELECTORS)) {
    if (excludeWithin?.contains(anchor)) continue;
    const tag = hashtagFromHref(anchor.getAttribute('href')) ?? hashtagFromText(anchor.textContent);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

/**
 * Classify the post format from structural DOM signals, in priority order. Falls back to `text`
 * (never throws). `scope` should be the body subtree — for a quote-repost that is the nested
 * original post, whose media carries the substance.
 */
export function classifyPostType(scope: Element): PostType {
  if (queryFirst(scope, POLL_SELECTORS)) return 'poll';
  if (queryFirst(scope, DOCUMENT_SELECTORS)) return 'document';
  if (queryFirst(scope, VIDEO_SELECTORS)) return 'video';
  if (queryFirst(scope, ARTICLE_SELECTORS)) return 'article';

  const imageContainer = queryFirst(scope, IMAGE_CONTAINER_SELECTORS);
  if (imageContainer) {
    const count = queryAll(imageContainer, IMAGE_SELECTORS).length;
    if (count >= 2) return 'multi_image';
    if (count === 1) return 'image';
  }
  return 'text';
}

function hashtagFromHref(href: string | null): string | null {
  if (!href || !href.includes('/hashtag/')) return null;
  try {
    const url = new URL(href, 'https://www.linkedin.com');
    const keyword = url.searchParams.get('keywords');
    if (keyword) return keyword.trim();
    const segment = url.pathname.split('/').filter(Boolean).pop();
    return segment ? decodeURIComponent(segment).trim() : null;
  } catch {
    return null;
  }
}

function hashtagFromText(raw: string | null): string | null {
  const text = cleanText(raw);
  if (!text) return null;
  return (
    text
      .replace(/hashtag/gi, '')
      .replace(/^#/, '')
      .trim() || null
  );
}
