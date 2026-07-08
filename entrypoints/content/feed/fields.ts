import type { AuthorType, PostType } from '@/shared/payload';
import { cleanText, queryAll, queryText } from '../dom';
import { parseLocalizedCount } from '../parse/number';
import {
  AUTHOR_LINK_SELECTORS,
  COMMENT_COUNT_PATTERN,
  HASHTAG_SELECTORS,
  POST_TEXT_SELECTORS,
  REACTION_COUNT_PATTERN,
  VIDEO_SELECTORS,
} from './selectors';

/** Post body as rendered (clamped behind "see more" but present); null when there is none. */
export function extractText(post: Element): string | null {
  return queryText(post, POST_TEXT_SELECTORS);
}

export interface AuthorInfo {
  name: string | null;
  profile_url: string | null;
  type: AuthorType;
}

/**
 * Author identity — the warm-intro core. The actor block has an avatar link (no text) and a
 * name link (text) both pointing at the profile; we take the first link WITH text as the name,
 * and its href as the profile URL. `/company/` → company, else person.
 */
export function extractAuthor(post: Element): AuthorInfo {
  const links = queryAll(post, AUTHOR_LINK_SELECTORS);
  const nameLink = links.find((a) => cleanText(a.textContent) !== null) ?? null;
  const link = nameLink ?? links[0] ?? null;

  const profile_url = normalizeProfileUrl(link?.getAttribute('href'));
  const type: AuthorType = profile_url?.includes('/company/') ? 'company' : 'person';
  const name = cleanText(nameLink?.textContent) ?? cleanText(link?.getAttribute('aria-label'));

  return { name, profile_url, type };
}

export interface Counts {
  reaction_count: number;
  comment_count: number;
}

/**
 * Reaction and comment counts. On the live feed these render as localized VISIBLE TEXT
 * ("1 234 réactions", "56 commentaires") — not aria-labels — so we scan short leaf-ish elements
 * (span/button/a), skip embedded comment threads, and take the first match per kind. Defaults to 0.
 * Reaction coverage is high; a numeric comment count is not always rendered (then it stays 0).
 */
export function extractCounts(post: Element): Counts {
  let reaction: number | null = null;
  let comment: number | null = null;
  for (const node of post.querySelectorAll('span, button, a')) {
    if (node.closest('[data-testid*="commentList" i]')) continue;
    const text = cleanText(node.textContent);
    if (!text || text.length > 40) continue;
    if (reaction == null) {
      const match = REACTION_COUNT_PATTERN.exec(text);
      if (match?.[1]) reaction = parseLocalizedCount(match[1]);
    }
    if (comment == null) {
      const match = COMMENT_COUNT_PATTERN.exec(text);
      if (match?.[1]) comment = parseLocalizedCount(match[1]);
    }
    if (reaction != null && comment != null) break;
  }
  return { reaction_count: reaction ?? 0, comment_count: comment ?? 0 };
}

/**
 * post_type. `<video>` is the one reliable structural marker on the SDUI feed, so we detect video
 * and default everything else to `text`. Distinguishing image / multi_image / document / poll /
 * article needs a content-media container anchor that isn't confirmed yet — counting `<img>`s
 * over-reports multi_image (avatars, face-piles, entity thumbnails), and a wrong media type misleads
 * the classifier more than a conservative `text`. Richer media typing is a tracked follow-up.
 */
export function classifyPostType(post: Element): PostType {
  if (post.querySelector(VIDEO_SELECTORS.join(','))) return 'video';
  return 'text';
}

/** Visible hashtags, `#`-stripped and de-duplicated (from the stable `/hashtag/` href). */
export function extractHashtags(post: Element): string[] {
  const tags: string[] = [];
  for (const anchor of queryAll(post, HASHTAG_SELECTORS)) {
    const tag = hashtagFromHref(anchor.getAttribute('href'));
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function normalizeProfileUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, 'https://www.linkedin.com');
    if (!url.hostname.replace(/^www\./, '').endsWith('linkedin.com')) return null;
    return `https://www.linkedin.com${url.pathname}`;
  } catch {
    return null;
  }
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
