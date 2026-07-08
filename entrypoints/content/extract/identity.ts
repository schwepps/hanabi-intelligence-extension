import { POST_URN_ATTRS, POST_URN_PATTERN } from '../selectors';

export interface PostIdentity {
  /** Full activity/ugcPost/share URN — the dedup key. */
  linkedin_post_id: string;
  /** Canonical permalink derived from the URN. */
  url: string;
}

/**
 * Read the post URN from the root's stable URN attribute and derive the permalink.
 * Returns null when no URN is resolvable — the caller skips the post (no dedup key possible).
 */
export function extractIdentity(root: Element): PostIdentity | null {
  const urn = readUrn(root);
  if (!urn) return null;
  return {
    linkedin_post_id: urn,
    url: `https://www.linkedin.com/feed/update/${urn}/`,
  };
}

function readUrn(root: Element): string | null {
  for (const attr of POST_URN_ATTRS) {
    const match = root.getAttribute(attr)?.match(POST_URN_PATTERN);
    if (match) return match[0];
  }
  return null;
}
