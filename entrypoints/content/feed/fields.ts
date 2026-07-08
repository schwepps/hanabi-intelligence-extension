import type { AuthorType, PostType } from '@/shared/payload';
import { cleanText, queryAll, queryText } from '../dom';
import { parseLocalizedCount } from '../parse/number';
import {
  AUTHOR_LINK_SELECTORS,
  COMMENT_LABEL_PATTERN,
  HASHTAG_SELECTORS,
  POST_TEXT_SELECTORS,
  REACTION_LABEL_PATTERN,
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
 * Reaction and comment counts, read from resolved `aria-label`s (the browser renders the SDUI
 * bindings into labels like "1,234 reactions" / "56 comments"). Defaults to 0. First numeric match
 * per kind wins; the comment aria-label is matched separately from reactions/reposts.
 */
export function extractCounts(post: Element): Counts {
  let reaction: number | null = null;
  let comment: number | null = null;
  for (const el of post.querySelectorAll('[aria-label]')) {
    const label = el.getAttribute('aria-label') ?? '';
    if (!/\d/.test(label)) continue;
    if (reaction == null && REACTION_LABEL_PATTERN.test(label))
      reaction = parseLocalizedCount(label);
    else if (comment == null && COMMENT_LABEL_PATTERN.test(label))
      comment = parseLocalizedCount(label);
  }
  return { reaction_count: reaction ?? 0, comment_count: comment ?? 0 };
}

/**
 * post_type from rendered structural signals (best-effort — the SDUI DOM has no clean type marker).
 * Video is reliable (`<video>`); image vs multi_image counts CONTENT images (excluding avatars in
 * author links and images inside embedded comment lists). document/poll/article need markers not
 * yet confirmed on the live feed → they currently fall through to image/text and are a known gap.
 */
export function classifyPostType(post: Element): PostType {
  if (post.querySelector(VIDEO_SELECTORS.join(','))) return 'video';
  const contentImages = [...post.querySelectorAll('img')].filter((img) => isContentImage(img));
  if (contentImages.length >= 2) return 'multi_image';
  if (contentImages.length === 1) return 'image';
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

function isContentImage(img: Element): boolean {
  // Exclude author avatars (inside a profile link) and images inside embedded comment threads.
  if (img.closest('a[href*="/in/"], a[href*="/company/"]')) return false;
  if (img.closest('[data-testid*="commentList" i]')) return false;
  return true;
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
