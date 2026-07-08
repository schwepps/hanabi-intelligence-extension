import type { PostPayload } from '@/shared/payload';
import { postCapture, postHello, readBridgeMessage } from '@/shared/window-bridge';
import { assemblePost, type AssembleContext } from './content/feed/assemble';
import { findFeedRoot, findPostNodes } from './content/feed/nodes';
import { extractActivityUrn } from './content/feed/react-urn';
import { debounce, FEED_OBSERVER_DEBOUNCE_MS } from './content/observer';

/**
 * MAIN-world feed reader. Runs in the page context so it can read each post's activity URN from
 * React props (the URN is not in any DOM attribute on the SDUI feed). Capture is off until the
 * isolated content script (which owns consent + the feed gate) enables it. Strictly passive: it
 * only reads what the sensor's session already rendered — no clicks, scrolls, or network calls.
 */
export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    const context: AssembleContext = { now: () => new Date().toISOString() };
    let observer: MutationObserver | null = null;

    const scan = (): void => {
      const feedRoot = findFeedRoot(document);
      if (!feedRoot) return;
      const posts: PostPayload[] = [];
      for (const node of findPostNodes(feedRoot)) {
        const payload = assemblePost(node, extractActivityUrn(node), context);
        if (payload) posts.push(payload);
      }
      if (posts.length > 0) postCapture(posts);
    };
    const scheduleScan = debounce(scan, FEED_OBSERVER_DEBOUNCE_MS);

    const start = (): void => {
      if (observer) return;
      observer = new MutationObserver(() => scheduleScan());
      observer.observe(document.body, { childList: true, subtree: true });
      scan(); // sweep posts already rendered
    };
    const stop = (): void => {
      observer?.disconnect();
      observer = null;
      scheduleScan.cancel();
    };

    window.addEventListener('message', (event) => {
      const message = readBridgeMessage(event);
      if (message?.kind !== 'control') return;
      if (message.enabled) start();
      else stop();
    });

    postHello(); // ask the isolated side for the current enable state (load-order safe)
  },
});
