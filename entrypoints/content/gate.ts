/**
 * Runtime capture gate. The content script is injected site-wide (LinkedIn is an SPA — see the
 * `matches` comment in index.ts); capture must run ONLY where the sensor is looking at a post they
 * chose to view — the scrolling home feed, or a single-post permalink they opened — never on
 * messaging, notifications, profiles, or the connection graph. Scoping is enforced here at runtime.
 */

/** How to read the current page, or null when capture must stay off. */
export type PageKind = 'feed' | 'permalink' | null;

/** True only for the home feed path (`/feed` or `/feed/`), not permalinks like `/feed/update/…`. */
export function isFeedPath(pathname: string): boolean {
  return pathname === '/feed' || pathname === '/feed/';
}

/**
 * True for a single-post permalink (`/posts/<slug>`) — the detail page for ONE post the sensor
 * opened. Deliberately NOT profiles (`/in/…`), messaging, notifications, or the connection graph.
 */
export function isPostPermalinkPath(pathname: string): boolean {
  return /^\/posts\/[^/]+\/?$/.test(pathname);
}

/** Classify a URL into a capture mode, or null. Host must be linkedin.com. */
export function pageKind(url: string | URL): PageKind {
  try {
    const parsed = typeof url === 'string' ? new URL(url, 'https://www.linkedin.com') : url;
    if (parsed.hostname.replace(/^www\./, '') !== 'linkedin.com') return null;
    if (isFeedPath(parsed.pathname)) return 'feed';
    if (isPostPermalinkPath(parsed.pathname)) return 'permalink';
    return null;
  } catch {
    return null;
  }
}

/** True when capture should run on this URL (home feed OR a post permalink). */
export function shouldCaptureUrl(url: string | URL): boolean {
  return pageKind(url) !== null;
}

/**
 * Watch client-side (SPA) route changes and invoke `onChange(shouldCapture)` whenever the
 * capture/no-capture state flips (feed or permalink → on; anything else → off). Primary signal is the
 * Navigation API (Chromium target); popstate + a low-frequency poll are defensive fallbacks. We never
 * monkey-patch `history` (that would mutate the page). Returns an unsubscribe function. Note: a
 * feed→permalink move keeps `shouldCapture` true (no flip) — the MAIN reader re-reads `pageKind` per
 * scan, so it switches mode without a toggle.
 */
export function watchCaptureState(
  onChange: (shouldCapture: boolean) => void,
  options: { pollMs?: number } = {},
): () => void {
  let current = shouldCaptureUrl(location.href);

  const notify = (): void => {
    const next = shouldCaptureUrl(location.href);
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
  // Poll only as a fallback when the Navigation API is unavailable — otherwise the `navigate` event
  // covers SPA routing and a continuous per-tab interval is wasted background work.
  const timer = nav ? undefined : setInterval(notify, options.pollMs ?? 1000);

  return () => {
    nav?.removeEventListener('navigate', deferredNotify);
    window.removeEventListener('popstate', notify);
    if (timer !== undefined) clearInterval(timer);
  };
}
