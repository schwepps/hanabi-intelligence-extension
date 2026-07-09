import { fakeBrowser } from 'wxt/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onPostCaptured, POST_CAPTURED, sendPostCaptured } from '@/shared/messages';
import { stubPayload } from '../support/factories';

describe('post-captured messaging', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('sendPostCaptured posts a typed { type, payload } message', () => {
    const spy = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue(undefined);
    const payload = stubPayload({ linkedin_post_id: 'urn:li:activity:1' });

    sendPostCaptured(payload);

    expect(spy).toHaveBeenCalledWith({ type: POST_CAPTURED, payload });
  });

  it('onPostCaptured invokes the handler only for matching messages', () => {
    let registered: ((message: unknown) => void) | undefined;
    vi.spyOn(browser.runtime.onMessage, 'addListener').mockImplementation((listener) => {
      registered = listener as (message: unknown) => void;
    });

    const handler = vi.fn();
    onPostCaptured(handler);

    const payload = stubPayload({ linkedin_post_id: 'urn:li:activity:2' });
    registered?.({ type: POST_CAPTURED, payload });
    registered?.({ type: 'unrelated' });
    registered?.(null);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
  });
});
