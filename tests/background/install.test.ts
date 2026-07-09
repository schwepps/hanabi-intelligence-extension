import { fakeBrowser } from 'wxt/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleInstalled } from '@/entrypoints/background/install';

describe('handleInstalled', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('opens the onboarding tab on a fresh install', async () => {
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);

    await handleInstalled({ reason: 'install' });

    expect(create).toHaveBeenCalledTimes(1);
    expect(String(create.mock.calls[0][0].url)).toContain('onboarding.html');
  });

  it('does nothing on update or browser_update', async () => {
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);

    await handleInstalled({ reason: 'update' });
    await handleInstalled({ reason: 'browser_update' });

    expect(create).not.toHaveBeenCalled();
  });
});
