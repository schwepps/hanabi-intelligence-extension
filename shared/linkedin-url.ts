/**
 * LinkedIn host checks. Uses an exact-suffix match so lookalike domains (`evillinkedin.com`,
 * `linkedin.com.evil.co`) are rejected — a plain `endsWith('linkedin.com')` would let both through.
 */
export function isLinkedInHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'linkedin.com' || host.endsWith('.linkedin.com');
}

/** True when `value` is an absolute URL string on linkedin.com (or a subdomain). */
export function isLinkedInUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    return isLinkedInHost(new URL(value).hostname);
  } catch {
    return false;
  }
}
