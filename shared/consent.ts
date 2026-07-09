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
