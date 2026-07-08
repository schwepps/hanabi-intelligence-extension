import { cleanText, queryFirst } from '../dom';
import {
  AUTHOR_LINK_SELECTORS,
  NESTED_UPDATE_SELECTORS,
  SURFACE_HEADER_SELECTORS,
  TIMESTAMP_SELECTORS,
} from '../selectors';

/**
 * Why a post is in the feed — the distinction that decides who we attribute it to. Locale-keyed on
 * VISIBLE VERB TEXT (classes rot), covering English + French (the sensor base is French).
 *
 * `socialProof` is INDEPENDENT of `kind`: a post can be both a reshare AND surfaced because a
 * connection engaged with it, so the surfacing name is captured separately.
 */
export interface Surface {
  kind: 'sponsored' | 'repost_quote' | 'repost_plain' | 'plain';
  /** The nested reshared update (the original post) for a quote repost; null otherwise. */
  inner: Element | null;
  /** Name of the 1st-degree connection whose engagement surfaced the post; null otherwise. */
  socialProof: string | null;
}

const SPONSORED = /promoted|sponsored|sponsoris|gesponsert|anzeige/i;
const SUGGESTED = /suggested|suggér|recommended|recommand/i;
const REPOST_VERB = /reposted|republi|a partagé|partagé|geteilt/i;
const ENGAGEMENT_VERB =
  /likes this|commented on|celebrates this|loves this|reacted to|finds this|supports this|a aimé|aime ceci|a commenté|a réagi|recommande ceci/i;

export function classifySurface(root: Element): Surface {
  const subDescription = cleanText(queryFirst(root, TIMESTAMP_SELECTORS)?.textContent);
  const header = queryFirst(root, SURFACE_HEADER_SELECTORS);
  const headerText = cleanText(header?.textContent);

  // Sponsored/promoted → skip. "Suggested" is algorithmic, not paid — do NOT treat as sponsored.
  if (isSponsored(subDescription) || isSponsored(headerText)) {
    return { kind: 'sponsored', inner: null, socialProof: null };
  }

  // Social-proof surfacing is orthogonal to repost-ness (a reshare can also be surfaced).
  const socialProof =
    headerText && ENGAGEMENT_VERB.test(headerText) ? headerActorName(header, headerText) : null;

  // Quote repost: a nested reshared update carrying the original post + its own actor.
  const inner = queryFirst(root, NESTED_UPDATE_SELECTORS);
  if (inner) return { kind: 'repost_quote', inner, socialProof };

  // Plain repost: "X reposted this" with the original rendered inline (no nested update).
  if (headerText && REPOST_VERB.test(headerText)) {
    return { kind: 'repost_plain', inner: null, socialProof };
  }

  return { kind: 'plain', inner: null, socialProof };
}

function isSponsored(text: string | null): boolean {
  return text != null && SPONSORED.test(text) && !SUGGESTED.test(text);
}

/** The surfacing connection's name from a social-proof header ("Connie Nection likes this"). */
function headerActorName(header: Element | null, headerText: string): string | null {
  const link = header ? cleanText(queryFirst(header, AUTHOR_LINK_SELECTORS)?.textContent) : null;
  if (link) return link;
  // Fallback: the text before the engagement verb.
  const match = headerText.match(/^(.*?)\s+(?:likes|commented|celebrates|loves|reacted|aime|a )/i);
  return match ? cleanText(match[1]) : null;
}
