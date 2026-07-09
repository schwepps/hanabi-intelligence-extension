import { logDebug } from '@/shared/log';
import { onPostCaptured } from '@/shared/messages';
import { handleInstalled } from './install';

export default defineBackground(() => {
  // Open the onboarding/consent screen on first install (FSC-111). Registered synchronously at the
  // top of the body so a cold-started MV3 worker still catches the one-shot onInstalled event.
  browser.runtime.onInstalled.addListener((details) => void handleInstalled(details));

  // Thin receiver: proves the content → background typed path end-to-end. The send-queue
  // (persist via storage.defineItem + retry on wake/alarms → ingestion API) is a later ticket and
  // will replace this body without touching the content script or the message contract.
  // The listener is registered synchronously so the worker wakes and receives the first message.
  let count = 0;
  onPostCaptured((payload) => {
    count += 1;
    logDebug('captured', count, payload.linkedin_post_id, payload.post_type);
  });
});
