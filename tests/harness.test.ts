import { describe, expect, it } from 'vitest';

// Smoke test: proves the WXT + Vitest harness is wired correctly by asserting the
// fake `browser` API (injected by WxtVitest) is available in the test runtime.
describe('test harness', () => {
  it('exposes a fake browser runtime API', () => {
    expect(browser.runtime).toBeDefined();
    expect(typeof browser.runtime.id).toBe('string');
  });
});
