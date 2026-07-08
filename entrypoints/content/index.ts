import { consentGranted } from '@/shared/consent';
import { logDebug } from '@/shared/log';
import { sendPostCaptured } from '@/shared/messages';
import { CaptureController } from './capture-controller';
import { queryFirst } from './dom';
import { assemblePost } from './extract';
import { isFeedUrl, watchFeed } from './gate';
import { FEED_CONTAINER_SELECTORS, findPostRoots } from './selectors';

export default defineContentScript({
  // Site-wide match is intentional: LinkedIn is an SPA, so a content script injects once on
  // document load and persists across client-side navigation. Narrowing `matches` to /feed/*
  // would miss the feed when the sensor first lands on another page and then navigates to it.
  // Feed-only scoping is enforced at RUNTIME (the isFeedUrl gate below) together with consent —
  // we never read messaging, notifications or the connection graph.
  matches: ['https://www.linkedin.com/*'],
  main() {
    const controller = new CaptureController({
      findContainer: () => queryFirst(document, FEED_CONTAINER_SELECTORS),
      findPostRoots: (container) => findPostRoots(container),
      extract: (root) => assemblePost(root),
      emit: (payload) => sendPostCaptured(payload),
    });

    // Capture runs only when BOTH the sensor is on the feed AND consent was granted (default off).
    let capturing = false;
    const evaluate = async (): Promise<void> => {
      const shouldCapture = isFeedUrl(location.href) && (await consentGranted.getValue());
      if (shouldCapture && !capturing) {
        capturing = true;
        logDebug('capture: starting (on feed, consent granted)');
        await controller.start();
      } else if (!shouldCapture && capturing) {
        capturing = false;
        logDebug('capture: stopping (left feed or consent revoked)');
        controller.stop();
      }
    };

    void evaluate();
    watchFeed(() => void evaluate()); // SPA route changes
    consentGranted.watch(() => void evaluate()); // consent toggled live (FSC-111)
  },
});
