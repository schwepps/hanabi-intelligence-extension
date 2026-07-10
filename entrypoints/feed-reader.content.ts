import { postCapture, postHello, readBridgeMessage } from '@/shared/window-bridge';
import { assemblePost, type AssembleContext } from './content/feed/assemble';
import { collectPosts, createCollectState } from './content/feed/collect';
import { findFeedRoot, findPermalinkPostNode, findPostNodes } from './content/feed/nodes';
import { extractActivityUrn, urnFromReactionFacepile } from './content/feed/react-urn';
import { FEED_DETAIL_SELECTOR } from './content/feed/selectors';
import { pageKind } from './content/gate';
import { createFeedObserver, type FeedObserver } from './content/observer';

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
    // A node captured (or abandoned after retries) is marked done so persistent posts aren't
    // re-walked (React-props traversal) on every settle; a node still hydrating on first sight is
    // retried on later settles rather than skipped forever. The isolated side is the durable dedup.
    const collectState = createCollectState();
    let observer: FeedObserver | null = null;

    // On a permalink the post lives inside a container whose testid contains `commentList`, so we
    // extract from a DETACHED clone — `closest(COMMENT_LIST_SELECTOR)` in the field extractors would
    // otherwise escape up to that container and blank the post. The URN is read from the LIVE node
    // first (facepile testid, then React props — a clone has neither).
    const assemblePermalink = (node: Element) => {
      const detail = document.querySelector(FEED_DETAIL_SELECTOR);
      const urn = urnFromReactionFacepile(detail ?? document) ?? extractActivityUrn(node);
      return assemblePost(node.cloneNode(true) as Element, urn, context);
    };

    const scan = (): void => {
      const kind = pageKind(location.href);
      if (kind === 'feed') {
        const feedRoot = findFeedRoot(document);
        if (!feedRoot) return;
        const posts = collectPosts(
          findPostNodes(feedRoot),
          (node) => assemblePost(node, extractActivityUrn(node), context),
          collectState,
        );
        if (posts.length > 0) postCapture(posts);
      } else if (kind === 'permalink') {
        const post = findPermalinkPostNode(document);
        if (!post) return; // detail not hydrated yet — retried on the next settle
        const posts = collectPosts([post], assemblePermalink, collectState);
        if (posts.length > 0) postCapture(posts);
      }
    };

    const start = (): void => {
      if (observer) return;
      scan(); // sweep posts already rendered
      observer = createFeedObserver(document.body, scan);
    };
    const stop = (): void => {
      observer?.disconnect();
      observer = null;
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
