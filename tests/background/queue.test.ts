import { fakeBrowser } from 'wxt/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearQueue,
  commitSent,
  dropIds,
  enqueue,
  MAX_QUEUE,
  type QueueEntry,
  sendQueue,
} from '@/entrypoints/background/queue';
import { hasSent, markSent } from '@/entrypoints/background/sent-ids';
import { stubPayload } from '../support/factories';

const urn = (n: number | string) => `urn:li:activity:${n}`;

describe('send queue', () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.restoreAllMocks());

  it('enqueue appends the post as an entry', async () => {
    const ok = await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    expect(ok).toBe(true);
    const queue = await sendQueue.getValue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(urn(1));
    expect(queue[0].payload.linkedin_post_id).toBe(urn(1));
    expect(typeof queue[0].enqueuedAt).toBe('number');
  });

  it('skips a post already confirmed sent', async () => {
    await markSent([urn(1)]);

    const ok = await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    expect(ok).toBe(false);
    expect(await sendQueue.getValue()).toHaveLength(0);
  });

  it('skips a post already in the queue', async () => {
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));
    const second = await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    expect(second).toBe(false);
    expect(await sendQueue.getValue()).toHaveLength(1);
  });

  it('serializes concurrent enqueues without losing any (mutex)', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => urn(i));

    await Promise.all(ids.map((id) => enqueue(stubPayload({ linkedin_post_id: id }))));

    expect(await sendQueue.getValue()).toHaveLength(50);
  });

  it('commitSent removes from the queue and marks the ids sent, atomically', async () => {
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));
    await enqueue(stubPayload({ linkedin_post_id: urn(2) }));

    await commitSent([urn(1)]);

    const queue = await sendQueue.getValue();
    expect(queue.map((e) => e.id)).toEqual([urn(2)]);
    expect(await hasSent(urn(1))).toBe(true);
    expect(await hasSent(urn(2))).toBe(false);
  });

  it('dropIds removes from the queue WITHOUT marking sent (poison drop)', async () => {
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));
    await enqueue(stubPayload({ linkedin_post_id: urn(2) }));

    await dropIds([urn(1)]);

    expect((await sendQueue.getValue()).map((e) => e.id)).toEqual([urn(2)]);
    expect(await hasSent(urn(1))).toBe(false);
  });

  it('clearQueue empties the queue (opt-out)', async () => {
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));
    await clearQueue();
    expect(await sendQueue.getValue()).toEqual([]);
  });

  it('FIFO-evicts the oldest entry past the cap, with a warning', async () => {
    const seeded: QueueEntry[] = Array.from({ length: MAX_QUEUE }, (_, i) => ({
      id: urn(i),
      payload: stubPayload({ linkedin_post_id: urn(i) }),
      enqueuedAt: i,
    }));
    await sendQueue.setValue(seeded);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await enqueue(stubPayload({ linkedin_post_id: urn('new') }));

    const queue = await sendQueue.getValue();
    expect(queue).toHaveLength(MAX_QUEUE);
    expect(queue.some((e) => e.id === urn(0))).toBe(false); // oldest evicted
    expect(queue.some((e) => e.id === urn('new'))).toBe(true); // newest kept
    expect(warn).toHaveBeenCalled();
  });
});
