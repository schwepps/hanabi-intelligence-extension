import { isLinkedInHost } from '@/shared/linkedin-url';
import type { AuthorDegree, AuthorType, CommentSignal, PostType } from '@/shared/payload';
import { cleanText, queryAll, queryFirst, queryText } from '../dom';
import { parseAuthorDegree } from '../parse/degree';
import { parseLocalizedCount } from '../parse/number';
import {
  ARTICLE_LINK_SELECTOR,
  AUTHOR_LINK_SELECTORS,
  COMMENT_COUNT_PATTERN,
  COMMENT_LIST_SELECTOR,
  DOCUMENT_SELECTOR,
  ENGAGEMENT_SURFACE_PATTERN,
  EXPANDABLE_TEXT_SELECTOR,
  HASHTAG_SELECTORS,
  HEADLINE_SPLIT_PATTERN,
  MEDIA_PAGES_PATTERN,
  PERSON_LINK_SELECTOR,
  POST_TEXT_SELECTORS,
  POSTED_AT_PATTERN,
  REACTION_COUNT_PATTERN,
  REPOST_SURFACE_PATTERN,
  RESHARED_UPDATE_LINK_SELECTOR,
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
  /** Author's connection degree to the sensor, read from the rendered name badge (FSC-116). */
  degree: AuthorDegree;
}

/**
 * Author identity — the warm-intro core. The actor block has an avatar link (no text) and a
 * name link (text) both pointing at the profile; we take the first link WITH text as the name,
 * and its href as the profile URL. `/company/` → company, else person.
 *
 * The degree badge renders as a suffix INSIDE the name link's text ("Victor Taki • 2e"), so we
 * parse the degree from that raw text and then strip the badge off the name (`shortName`) — else
 * `author_name` leaks "• 2e" / "• Suivi" (FSC-116). Reads only the rendered badge; the connection
 * list is never enumerated (guardrail).
 *
 * Links inside `excludeHeader` (a social-proof context header) and inside embedded comment threads
 * are skipped, so on a surfaced post the author — AND its degree — is the real poster, not the
 * surfacing connection (whose link comes first) or a commenter.
 */
export function extractAuthor(post: Element, excludeHeader?: Element | null): AuthorInfo {
  const { nameLink, link } = resolveActor(post, excludeHeader);

  const profile_url = normalizeProfileUrl(link?.getAttribute('href'));
  // Organizations (company + school Pages) are 'company'; only /in/ members are 'person'.
  const type: AuthorType =
    profile_url != null && /\/(?:company|school)\//.test(profile_url) ? 'company' : 'person';
  const rawName = cleanText(nameLink?.textContent) ?? cleanText(link?.getAttribute('aria-label'));
  const name = shortName(rawName);
  // Only members have a connection degree; a company/school Page has none — and its name could
  // otherwise false-match the ordinal regex (e.g. "2nd Street" → 'second').
  const degree = type === 'person' ? parseAuthorDegree(rawName) : 'none';

  return { name, profile_url, type, degree };
}

/**
 * Resolve the author's actor link: the candidate profile links (excluding the surface header and
 * comment threads), the first text-bearing one as `nameLink`, and `link` as the resolved actor
 * (name link, else the first candidate). Shared by `extractAuthor` (name/degree/type) and
 * `authorContainer` (company/title scope) so both always describe the SAME actor.
 */
function resolveActor(
  post: Element,
  excludeHeader?: Element | null,
): { nameLink: Element | null; link: Element | null } {
  const links = queryAll(post, AUTHOR_LINK_SELECTORS).filter(
    (a) => !a.closest(COMMENT_LIST_SELECTOR) && !(excludeHeader && excludeHeader.contains(a)),
  );
  const nameLink = links.find((a) => cleanText(a.textContent) !== null) ?? null;
  return { nameLink, link: nameLink ?? links[0] ?? null };
}

export interface SurfaceHeader {
  el: Element;
  /** `engagement` → a connection liked/commented (social proof); `repost` → a reshare. */
  kind: 'engagement' | 'repost';
  /** The surfacing connection's name (for engagement) / resharer (for repost). */
  name: string | null;
}

/**
 * The context header above a post ("<Connection> a aimé ceci" / "… a republié"), or null for a
 * plain authored post. Anchored on localized VERB TEXT (durable), skipping the body text box and
 * embedded comments. Drives social_proof (engagement) and is_repost (repost), and lets the author
 * extractor ignore the surfacing connection's link.
 */
export function findSurfaceHeader(post: Element): SurfaceHeader | null {
  for (const node of post.querySelectorAll('span, div, a')) {
    if (node.childElementCount > 4 || node.closest(COMMENT_LIST_SELECTOR)) continue;
    if (node.querySelector(EXPANDABLE_TEXT_SELECTOR)) continue; // the post/comment body
    const text = cleanText(node.textContent);
    if (!text || text.length > 90) continue;
    const kind = ENGAGEMENT_SURFACE_PATTERN.test(text)
      ? 'engagement'
      : REPOST_SURFACE_PATTERN.test(text)
        ? 'repost'
        : null;
    if (!kind) continue;
    return { el: node, kind, name: surfaceName(node, text) };
  }
  return null;
}

export interface RepostInfo {
  is_repost: boolean;
  /** The reshared post's original author — never the resharer. Null when not a (resolvable) repost. */
  original_author_name: string | null;
  original_author_profile_url: string | null;
}

/**
 * The nested reshared-post card of a quote-repost (reshare-with-thoughts). The original post renders
 * in an embedded card that links to its own update; we anchor on that `/feed/update/` link (skipping
 * any inside a preview comment thread, as the sibling extractors do) and climb to the nearest ancestor
 * carrying an author actor link — that container IS the original post's card, holding the original
 * author (distinct from the resharer above it). Grounded on a live quote-repost. Returns null for a
 * plain feed post (no embedded-update link).
 */
export function findResharedCard(post: Element): Element | null {
  const embedded = [...post.querySelectorAll(RESHARED_UPDATE_LINK_SELECTOR)].find(
    (link) => !link.closest(COMMENT_LIST_SELECTOR),
  );
  if (!embedded) return null;
  let node = embedded.parentElement;
  while (node && node !== post) {
    if (queryFirst(node, AUTHOR_LINK_SELECTORS)) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Resolve the reshared post's ORIGINAL author (never the resharer), across both reshare shapes:
 *  - Quote-repost (reshare-with-thoughts): the outer author is the resharer; the original author lives
 *    in the embedded reshared card (`findResharedCard`), extracted with the same `extractAuthor`.
 *  - Plain reshare: the surface header is the resharer verb-line and the rendered `author` (that header
 *    excluded from the scan) is already the original poster — so we attribute to `author`, not `header.name`.
 *
 * Never attributes to the resharer: if the card resolves back to the outer `author` (an over-captured
 * subtree, or a non-reshare that merely links to an update) we treat it as unresolved. And because the
 * backend rejects a repost with a null `original_author_name` (FSC-98 refine), an unresolved original
 * downgrades to a non-repost rather than emit a resharer-attributed record (FSC-115 AC #3).
 */
export function resolveRepost(
  post: Element,
  header: SurfaceHeader | null,
  author: AuthorInfo,
): RepostInfo {
  const card = findResharedCard(post);
  if (card) {
    const original = extractAuthor(card);
    if (original.name && !isSameActor(original, author)) {
      return {
        is_repost: true,
        original_author_name: original.name,
        original_author_profile_url: original.profile_url,
      };
    }
  }
  if (header?.kind === 'repost' && author.name) {
    return {
      is_repost: true,
      original_author_name: author.name,
      original_author_profile_url: author.profile_url,
    };
  }
  return { is_repost: false, original_author_name: null, original_author_profile_url: null };
}

/** Whether two extracted authors are the same actor (by profile URL, else by name). */
function isSameActor(a: AuthorInfo, b: AuthorInfo): boolean {
  if (a.profile_url !== null && a.profile_url === b.profile_url) return true;
  return a.name !== null && a.name === b.name;
}

/** Visible preview comments (commenter identity + text) — an engagement/warm-intro signal. */
export function extractComments(post: Element): CommentSignal[] {
  const comments: CommentSignal[] = [];
  const seen = new Set<Element>();
  for (const list of post.querySelectorAll(COMMENT_LIST_SELECTOR)) {
    for (const box of list.querySelectorAll(EXPANDABLE_TEXT_SELECTOR)) {
      const container = commentContainer(box, list);
      if (!container || seen.has(container)) continue;
      seen.add(container);
      const link = container.querySelector(PERSON_LINK_SELECTOR);
      comments.push({
        author_name: shortName(
          cleanText(link?.textContent) ?? cleanText(link?.getAttribute('aria-label')),
        ),
        author_profile_url: normalizeProfileUrl(link?.getAttribute('href')),
        text: cleanText(box.textContent),
      });
    }
  }
  return comments;
}

function surfaceName(header: Element, text: string): string | null {
  const linked = shortName(cleanText(header.querySelector('a[href*="/in/"]')?.textContent));
  if (linked) return linked;
  const match = text.match(
    /^(.{2,60}?)\s+(?:a |aime|likes|commented|celebrates|loves|reacted|reposted|recommande)/i,
  );
  return match ? cleanText(match[1]) : null;
}

/** Smallest ancestor of a comment's text box (within the list) that carries a commenter link. */
function commentContainer(box: Element, list: Element): Element | null {
  let node = box.parentElement;
  while (node && node !== list && list.contains(node)) {
    if (node.querySelector(PERSON_LINK_SELECTOR)) return node;
    node = node.parentElement;
  }
  return null;
}

/** Keep the leading name segment (commenter links can trail degree/headline). */
function shortName(name: string | null | undefined): string | null {
  if (!name) return null;
  const head = name.split(/[·•|]/)[0];
  return cleanText(head)?.slice(0, 80) ?? null;
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
    // Count labels are leaf-ish; skip large containers before reading textContent (subtree walk).
    if (node.childElementCount > 3 || node.closest(COMMENT_LIST_SELECTOR)) continue;
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
 * The post's own relative timestamp ("16 h", "3 j"), verbatim — the backend derives the date. Scans
 * short leaf nodes in DOM order (the actor timestamp precedes the body and any quote-repost inner
 * card), skipping comment threads AND the post body — the actor timestamp lives in the actor block,
 * never inside the body box, so excluding the body keeps a bare timestamp-like token in the text
 * ("2h", "now") from being misread as the posted-at. Accepts only a leaf that is JUST the timestamp
 * (+ separators / "Modifié"), so a headline that starts with a number ("5 ans …") is never mistaken
 * for one. Null when not rendered.
 */
export function extractPostedAt(post: Element): string | null {
  for (const node of post.querySelectorAll('span, a, button, time')) {
    if (
      node.childElementCount > 2 ||
      node.closest(COMMENT_LIST_SELECTOR) ||
      node.closest(EXPANDABLE_TEXT_SELECTOR)
    )
      continue;
    const text = cleanText(node.textContent);
    if (!text || text.length > 40) continue;
    const match = POSTED_AT_PATTERN.exec(text);
    if (!match) continue;
    // Only the timestamp itself (edited marker + separators aside) — else it's a numeric headline.
    const rest = text
      .slice(match[0].length)
      .replace(/modifi[ée]e?|edited/gi, '')
      .replace(/[\s·•|]+/g, '');
    if (rest === '') return cleanText(match[1]);
  }
  return null;
}

export interface AuthorHeadline {
  company: string | null;
  title: string | null;
}

/** The bounded actor block around the author name link (climbs up, but never swallows the body). */
function authorContainer(post: Element, excludeHeader?: Element | null): Element | null {
  const { link } = resolveActor(post, excludeHeader);
  if (!link) return null;
  let node: Element = link;
  for (let i = 0; i < 5 && node.parentElement && node.parentElement !== post; i++) {
    if (node.parentElement.querySelector(EXPANDABLE_TEXT_SELECTOR)) break; // don't swallow the body
    node = node.parentElement;
  }
  return node;
}

/**
 * Best-effort author company/title from the headline subtitle (FSC-118). Scans the actor block only
 * (never the body), and splits the FIRST leaf whose first `|`/`·`/`•` segment matches "X chez/at/@ Y"
 * — else both null. FR headlines are noisy free-text taglines, so we never guess a company from one.
 */
export function extractAuthorHeadline(
  post: Element,
  excludeHeader?: Element | null,
): AuthorHeadline {
  const container = authorContainer(post, excludeHeader);
  if (!container) return { company: null, title: null };
  for (const el of container.querySelectorAll('span, p, div')) {
    if (el.childElementCount > 0 || el.closest(COMMENT_LIST_SELECTOR)) continue;
    if (el.closest(EXPANDABLE_TEXT_SELECTOR) || (excludeHeader && excludeHeader.contains(el)))
      continue;
    const text = cleanText(el.textContent);
    if (!text || text.length > 120) continue;
    const segment = cleanText(text.split(/[·•|]/)[0]);
    const match = segment ? HEADLINE_SPLIT_PATTERN.exec(segment) : null;
    if (!match) continue;
    const title = cleanText(match[1] ?? match[3]);
    const company = cleanText(match[2] ?? match[4]);
    if (title && company) return { company: company.slice(0, 100), title: title.slice(0, 100) };
  }
  return { company: null, title: null };
}

/**
 * post_type — CONSERVATIVE by design: a wrong type is permanent at ingest (first-capture-wins), so
 * strictly worse than `text`. We only emit a non-text format on a recon-validated, high-confidence
 * structural anchor, most-specific first: `video` (<video>), `document` (page-nav control), `article`
 * (a standalone `/pulse/` card, not a body link). Everything else — image, multi_image, poll,
 * external-link shares — falls to `text`: on the live SDUI feed content `<img>`s report width 0 / are
 * background images (no reliable image anchor; avatars/face-piles over-report multi_image), and
 * `role="radio"` is NOT poll-specific (it fires on unrelated posts). Those stay a tracked follow-up.
 */
export function classifyPostType(post: Element): PostType {
  if (post.querySelector(VIDEO_SELECTORS.join(','))) return 'video';
  if (post.querySelector(DOCUMENT_SELECTOR)) return 'document';
  if (isArticleShare(post)) return 'article';
  return 'text';
}

/** A standalone `/pulse/` article card (a `/pulse/` link outside the body text / comments). */
function isArticleShare(post: Element): boolean {
  return [...post.querySelectorAll(ARTICLE_LINK_SELECTOR)].some(
    (link) => !link.closest(EXPANDABLE_TEXT_SELECTOR) && !link.closest(COMMENT_LIST_SELECTOR),
  );
}

/**
 * The document/carousel title from its "<title> · N pages" badge (FSC-117), gated on `document` — the
 * only classified type with a clean title, so we never grab an arbitrary heading off a `text` post.
 * Best-effort: the badge's containing element ends with the localized "N pages" tail, and we keep the
 * title before it. Null otherwise — article-card titles are too noisy to extract cleanly, and
 * multi_image is not yet classified, so both stay null until a durable anchor lands.
 */
export function extractMediaTitle(post: Element, type: PostType): string | null {
  if (type !== 'document') return null;
  for (const el of post.querySelectorAll('span, div, p')) {
    if (el.childElementCount > 6 || el.closest(COMMENT_LIST_SELECTOR)) continue;
    if (el.closest(EXPANDABLE_TEXT_SELECTOR)) continue;
    const text = cleanText(el.textContent);
    if (!text || text.length > 120) continue;
    const title = cleanText(MEDIA_PAGES_PATTERN.exec(text)?.[1]);
    if (title) return title.slice(0, 200);
  }
  return null;
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
    if (!isLinkedInHost(url.hostname)) return null;
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
