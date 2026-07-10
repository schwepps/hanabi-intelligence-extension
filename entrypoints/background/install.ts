/**
 * First-launch onboarding trigger. Opens the full-tab consent screen once, on FRESH
 * install only — never on extension update or browser update. Extracted from the background entry so
 * the branch is unit-testable. Opening the extension's own page needs no `tabs` permission.
 */

/** Structural subset of `runtime.onInstalled` details — all we branch on is `reason`. */
export interface InstalledDetails {
  reason: string;
}

export async function handleInstalled(details: InstalledDetails): Promise<void> {
  if (details.reason !== 'install') return;
  await browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
}
