/**
 * The `browser.alarms` seam — the ONLY MV3-durable wake primitive. A `setTimeout`-based retry dies
 * with the idle worker (~30 s), dropping the retry on the very failure we must recover from; an alarm
 * survives worker death and browser restart. Isolated here as thin wrappers so the drain logic stays
 * platform-free and tests can stub scheduling without a fake clock.
 */

/** Single alarm name for the send-queue retry — same-name `create` replaces, so retries never stack. */
export const RETRY_ALARM_NAME = 'hanabi:sendRetry';

/** Schedule (or reschedule) the retry drain `delayInMinutes` from now. */
export function scheduleRetry(delayInMinutes: number): void {
  void browser.alarms.create(RETRY_ALARM_NAME, { delayInMinutes });
}

/** Cancel any pending retry alarm (queue drained clean). */
export function clearRetry(): void {
  void browser.alarms.clear(RETRY_ALARM_NAME);
}

/** Run `handler` when the retry alarm fires (ignores any other alarm). */
export function onRetryAlarm(handler: () => void): void {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RETRY_ALARM_NAME) handler();
  });
}
