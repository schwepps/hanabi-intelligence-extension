import { fakeBrowser } from 'wxt/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { hasSent, markSent, MAX_SENT_IDS, sentIds } from '@/entrypoints/background/sent-ids';

describe('sent-ids (persistent already-sent set)', () => {
  beforeEach(() => fakeBrowser.reset());

  it('starts empty', async () => {
    expect(await sentIds.getValue()).toEqual([]);
    expect(await hasSent('urn:li:activity:1')).toBe(false);
  });

  it('markSent records ids so hasSent reports them, and persists', async () => {
    await markSent(['urn:li:activity:1', 'urn:li:activity:2']);

    expect(await hasSent('urn:li:activity:1')).toBe(true);
    expect(await hasSent('urn:li:activity:2')).toBe(true);
    expect(await hasSent('urn:li:activity:3')).toBe(false);
    expect(await sentIds.getValue()).toHaveLength(2);
  });

  it('is idempotent — re-marking a known id adds no duplicate', async () => {
    await markSent(['urn:li:activity:1']);
    await markSent(['urn:li:activity:1']);
    expect(await sentIds.getValue()).toEqual(['urn:li:activity:1']);
  });

  it('marking an empty list is a no-op', async () => {
    await markSent([]);
    expect(await sentIds.getValue()).toEqual([]);
  });

  it('FIFO-evicts the oldest ids past the cap', async () => {
    const ids = Array.from({ length: MAX_SENT_IDS + 1 }, (_, i) => `urn:li:activity:${i}`);
    await markSent(ids);

    const stored = await sentIds.getValue();
    expect(stored).toHaveLength(MAX_SENT_IDS);
    expect(await hasSent('urn:li:activity:0')).toBe(false); // oldest evicted
    expect(await hasSent(`urn:li:activity:${MAX_SENT_IDS}`)).toBe(true); // newest kept
  });
});
