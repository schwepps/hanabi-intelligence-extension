/**
 * Runtime feed gate. The content script is injected site-wide (LinkedIn is an SPA — see the
 * `matches` comment in index.ts); capture must run ONLY on the scrolling home feed, never on
 * messaging, notifications, profiles, or the connection graph. Scoping is enforced here at runtime.
 */

/** True only for the home feed path (`/feed` or `/feed/`), not permalinks like `/feed/update/…`. */
export function isFeedPath(pathname: string): boolean {
  return pathname === '/feed' || pathname === '/feed/';
}

/** True when a full URL points at the LinkedIn home feed. */
export function isFeedUrl(url: string | URL): boolean {
  try {
    const parsed = typeof url === 'string' ? new URL(url, 'https://www.linkedin.com') : url;
    const host = parsed.hostname.replace(/^www\./, '');
    if (host !== 'linkedin.com') return false;
    return isFeedPath(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Watch client-side (SPA) route changes and invoke `onChange(onFeed)` whenever the feed/non-feed
 * state flips. Primary signal is the Navigation API (Chromium target); popstate + a low-frequency
 * poll are defensive fallbacks. We never monkey-patch `history` (that would mutate the page).
 * Returns an unsubscribe function.
 */
export function watchFeed(
  onChange: (onFeed: boolean) => void,
  options: { pollMs?: number } = {},
): () => void {
  let current = isFeedUrl(location.href);

  const notify = (): void => {
    const next = isFeedUrl(location.href);
    if (next !== current) {
      current = next;
      onChange(next);
    }
  };
  // The `navigate` event can fire before `location` settles — defer a tick.
  const deferredNotify = (): void => {
    setTimeout(notify, 0);
  };

  const nav = (window as unknown as { navigation?: EventTarget }).navigation;
  nav?.addEventListener('navigate', deferredNotify);
  window.addEventListener('popstate', notify);
  const timer = setInterval(notify, options.pollMs ?? 1000);

  return () => {
    nav?.removeEventListener('navigate', deferredNotify);
    window.removeEventListener('popstate', notify);
    clearInterval(timer);
  };
}
