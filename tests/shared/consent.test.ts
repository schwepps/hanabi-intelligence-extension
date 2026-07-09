import { fakeBrowser } from 'wxt/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { consentedAt, consentGranted, grantConsent, revokeConsent } from '@/shared/consent';

describe('consent helpers', () => {
  beforeEach(() => fakeBrowser.reset());

  it('defaults to off with no consent timestamp', async () => {
    expect(await consentGranted.getValue()).toBe(false);
    expect(await consentedAt.getValue()).toBeNull();
  });

  it('grantConsent flips the flag true and stamps consentedAt', async () => {
    await grantConsent();
    expect(await consentGranted.getValue()).toBe(true);
    expect(typeof (await consentedAt.getValue())).toBe('number');
  });

  it('revokeConsent flips the flag false and clears the stamp', async () => {
    await grantConsent();
    await revokeConsent();
    expect(await consentGranted.getValue()).toBe(false);
    expect(await consentedAt.getValue()).toBeNull();
  });
});
