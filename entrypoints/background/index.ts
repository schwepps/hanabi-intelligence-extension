import { consentGranted } from '@/shared/consent';
import { sensorIdentity } from '@/shared/identity';
import { onPostCaptured } from '@/shared/messages';
import { drain, enqueueAndDrain, handleConsentChange } from './drain';
import { handleInstalled } from './install';
import { onRetryAlarm } from './scheduler';

export default defineBackground(() => {
  // Open the onboarding/consent screen on first install (FSC-111). Registered synchronously at the
  // top of the body so a cold-started MV3 worker still catches the one-shot onInstalled event.
  browser.runtime.onInstalled.addListener((details) => void handleInstalled(details));

  // Send-queue wiring (FSC-112). This entrypoint is pure wiring: every listener registers
  // synchronously so a waking worker catches its trigger, and all behavior lives in ./drain and its
  // collaborators (queue, send, backoff, scheduler — each unit-tested).
  onPostCaptured((payload) => void enqueueAndDrain(payload)); // capture → durable queue → send
  onRetryAlarm(() => void drain()); // scheduled backoff retry after a failure
  sensorIdentity.watch(() => void drain()); // resume the drain right after a re-link (401 recovery)
  consentGranted.watch((granted) => void handleConsentChange(granted)); // opt-out clears the queue

  // Startup recovery: drain anything the previous (killed) worker left queued.
  void drain();
});
