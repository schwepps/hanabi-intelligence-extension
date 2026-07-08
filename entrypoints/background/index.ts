import { logDebug } from '@/shared/log';
import { onPostCaptured } from '@/shared/messages';

export default defineBackground(() => {
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
