import { consentGranted } from '@/shared/consent';
import { logDebug } from '@/shared/log';
import { sendPostCaptured } from '@/shared/messages';
import {
  isValidCapturedPost,
  MAX_CAPTURE_POSTS,
  postControl,
  readBridgeMessage,
} from '@/shared/window-bridge';
import { DedupStore } from './dedup';
import { shouldCaptureUrl, watchCaptureState } from './gate';

export default defineContentScript({
  // Site-wide match is intentional: LinkedIn is an SPA, so a content script injects once on
  // document load and persists across client-side navigation. Feed-only scoping is enforced at
  // RUNTIME (the isFeedUrl gate) together with consent — we never read messaging, notifications
  // or the connection graph.
  matches: ['https://www.linkedin.com/*'],
  main() {
    // The MAIN-world reader (feed-reader.ts) extracts posts (it can read React props for the URN);
    // this isolated script owns consent + the feed gate, dedups, and forwards to the background.
    const seen = new DedupStore();
    let enabled = false;

    window.addEventListener('message', (event) => {
      const message = readBridgeMessage(event);
      if (!message) return;
      if (message.kind === 'hello') {
        postControl(enabled); // reader just loaded — tell it the current state
        return;
      }
      if (message.kind === 'capture' && enabled) {
        // The bridge is forgeable — validate every payload before dedup/forward, and cap volume.
        for (const payload of message.posts.slice(0, MAX_CAPTURE_POSTS)) {
          if (!isValidCapturedPost(payload)) continue;
          if (seen.add(payload.linkedin_post_id)) sendPostCaptured(payload);
        }
      }
    });

    // Capture runs only when BOTH on a capture surface (feed or post permalink) AND consent granted
    // (default off, safe by default).
    const evaluate = async (): Promise<void> => {
      const shouldCapture = shouldCaptureUrl(location.href) && (await consentGranted.getValue());
      if (shouldCapture === enabled) return;
      enabled = shouldCapture;
      logDebug(
        enabled ? 'capture: enabled (feed/permalink, consent granted)' : 'capture: disabled',
      );
      postControl(enabled);
    };

    void evaluate();
    watchCaptureState(() => void evaluate()); // SPA route changes
    consentGranted.watch(() => void evaluate()); // consent toggled live
  },
});
