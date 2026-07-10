/**
 * Consent gate — safe by default. Capture stays OFF until the sensor explicitly opts in.
 *
 * The onboarding UI + identity linking flips this to `true`; the capture layer only reads
 * it and gates the observer on it. Persisted in `browser.storage.local` (survives worker restarts
 * and reloads), which is why `wxt.config.ts` declares the `storage` permission.
 *
 * Manual enable for demoing capture before onboarding exists — from the extension's service-worker
 * devtools console:
 *   chrome.storage.local.set({ 'hanabi:consentGranted': true })
 * (deliberately not auto-consented in dev builds: that would undermine "safe by default".)
 */
export const consentGranted = storage.defineItem<boolean>('local:hanabi:consentGranted', {
  fallback: false,
});

/**
 * Local timestamp (epoch ms, local clock) of when the sensor last granted consent IN THE EXTENSION;
 * `null` = not currently consented. This is a local, at-a-glance record — NOT the authoritative GDPR
 * record, which is the server-set `sensors.consented_at` (via POST /api/sensor/consent) and may differ
 * in both value and format (ISO string).
 */
export const consentedAt = storage.defineItem<number | null>('local:hanabi:consentedAt', {
  fallback: null,
});

/** Turn capture ON and stamp the consent moment. The content gate's `consentGranted.watch()` starts capture live. */
export async function grantConsent(): Promise<void> {
  await consentGranted.setValue(true);
  await consentedAt.setValue(Date.now());
}

/** Turn capture OFF (opt-out). The content gate stops capture live; the linked identity is kept for easy re-opt-in. */
export async function revokeConsent(): Promise<void> {
  await consentGranted.setValue(false);
  await consentedAt.setValue(null);
}
