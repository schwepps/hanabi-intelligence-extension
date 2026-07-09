/**
 * Consent gate — safe by default. Capture stays OFF until the sensor explicitly opts in.
 *
 * FSC-111 adds the onboarding UI + identity linking that flips this to `true`; FSC-110 only reads
 * it and gates the observer on it. Persisted in `browser.storage.local` (survives worker restarts
 * and reloads), which is why `wxt.config.ts` declares the `storage` permission.
 *
 * Manual enable for demoing FSC-110 before FSC-111 exists — from the extension's service-worker
 * devtools console:
 *   chrome.storage.local.set({ 'hanabi:consentGranted': true })
 * (deliberately not auto-consented in dev builds: that would undermine "safe by default".)
 */
export const consentGranted = storage.defineItem<boolean>('local:hanabi:consentGranted', {
  fallback: false,
});

/**
 * Local GDPR record of WHEN the sensor consented (epoch ms; `null` = not consented). The
 * authoritative consent record lives server-side (`sensors.consented_at`, set via the extension's
 * onboarding). This mirrors it locally so the popup/onboarding can reflect state without a round-trip.
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
