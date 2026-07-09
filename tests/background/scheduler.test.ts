import { fakeBrowser } from 'wxt/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRetry,
  onRetryAlarm,
  RETRY_ALARM_NAME,
  scheduleRetry,
} from '@/entrypoints/background/scheduler';

describe('retry scheduler (browser.alarms seam)', () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.restoreAllMocks());

  it('scheduleRetry creates a single named alarm (same name replaces, never stacks)', async () => {
    const create = vi.spyOn(browser.alarms, 'create');

    await scheduleRetry(2);

    expect(create).toHaveBeenCalledWith(RETRY_ALARM_NAME, { delayInMinutes: 2 });
  });

  it('clearRetry clears the named alarm', () => {
    const clear = vi.spyOn(browser.alarms, 'clear');

    clearRetry();

    expect(clear).toHaveBeenCalledWith(RETRY_ALARM_NAME);
  });

  it('onRetryAlarm fires only for the retry alarm', () => {
    const add = vi.spyOn(browser.alarms.onAlarm, 'addListener');
    const handler = vi.fn();

    onRetryAlarm(handler);
    const listener = add.mock.calls[0][0];

    listener({ name: RETRY_ALARM_NAME, scheduledTime: 0, persistAcrossSessions: false });
    listener({ name: 'some-other-alarm', scheduledTime: 0, persistAcrossSessions: false });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
