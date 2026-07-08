import type { AuthorDegree, AuthorType } from '@/shared/payload';
import { cleanText, queryAll, queryFirst, queryText } from '../dom';
import { mapDegree } from '../parse/degree';
import {
  ACTOR_CONTAINER_SELECTORS,
  AUTHOR_LINK_SELECTORS,
  AUTHOR_NAME_SELECTORS,
  AUTHOR_TITLE_SELECTORS,
  DEGREE_BADGE_SELECTORS,
  SURFACE_HEADER_SELECTORS,
} from '../selectors';

export interface ActorFields {
  name: string | null;
  profile_url: string | null;
  type: AuthorType;
  title: string | null;
  company: string | null;
  degree: AuthorDegree;
}

/**
 * Extract the actor (author) block within `scope` — the FIRST actor in document order. `scope` is
 * the post root for a plain post (or the resharer of a quote-repost), or the nested update element
 * for a reshare's original author.
 */
export function extractActor(scope: Element): ActorFields {
  const actor = queryFirst(scope, ACTOR_CONTAINER_SELECTORS) ?? scope;

  const link = firstAuthorLink(actor);
  const profile_url = normalizeProfileUrl(link?.getAttribute('href'));
  const type: AuthorType = profile_url?.includes('/company/') ? 'company' : 'person';

  const name = queryText(actor, AUTHOR_NAME_SELECTORS) ?? cleanText(link?.textContent);
  const title = queryText(actor, AUTHOR_TITLE_SELECTORS);
  const degree = mapDegree(queryText(actor, DEGREE_BADGE_SELECTORS));
  const company = extractCompany(title, type, name);

  return { name, profile_url, type, title, company, degree };
}

/**
 * The first author profile link within `scope`, EXCLUDING links inside a context/social-proof
 * header. Without this, a fallback scan (when the actor container class drifts) could grab the
 * surfacing connection's link from the "X likes this" header and mis-attribute the author.
 */
function firstAuthorLink(scope: Element): Element | null {
  const headerSelector = SURFACE_HEADER_SELECTORS.join(',');
  for (const link of queryAll(scope, AUTHOR_LINK_SELECTORS)) {
    if (link.closest(headerSelector)) continue;
    return link;
  }
  return null;
}

/** Absolute LinkedIn URL with tracking query/hash stripped; null for empty or off-host hrefs. */
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

/**
 * Best-effort company: a company-page author IS the company; a person's employer is often embedded
 * in the headline ("CTO at Globex · …"). Returns null when it can't be isolated — never fabricated.
 */
function extractCompany(
  title: string | null,
  type: AuthorType,
  name: string | null,
): string | null {
  if (type === 'company') return name;
  if (!title) return null;
  const match = title.match(/(?:\bat\b|\bchez\b|@)\s+([^|·•—]+)/i);
  return match ? cleanText(match[1]) : null;
}
